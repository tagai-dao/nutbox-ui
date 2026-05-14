import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { fetchCommunity } from '../config/subgraph';
import { useWeb3 } from '../contexts/Web3Context';
import { useToast } from '../contexts/ToastContext';
import { useCommunity, useCommunityRead, useCommittee, useLinearCalculator, useERC20Read } from '../hooks/useContract';
import { CONTRACTS, BLOCKS_PER_YEAR } from '../config/contracts';
import { ERC20StakingABI, ERC20LockingABI, ERC20ABI } from '../config/abis';
import { formatTokenAmount, shortenAddress, formatDate, formatDuration, getPoolTypeLabel, getPoolTypeBadgeClass, getBscScanUrl, copyToClipboard } from '../utils/helpers';
import PoolCard from '../components/pool/PoolCard';
import AddPoolModal from '../components/community/AddPoolModal';
import './CommunityDetail.css';

export default function CommunityDetail() {
  const { address } = useParams();
  const { account, isConnected, readProvider, signer } = useWeb3();
  const toast = useToast();

  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [rewardRate, setRewardRate] = useState(null);
  const [showAddPool, setShowAddPool] = useState(false);
  const [activeTab, setActiveTab] = useState('pools');

  const communityContract = useCommunityRead(address);
  const calculator = useLinearCalculator();

  // Load community data from subgraph
  const loadCommunity = useCallback(async () => {
    try {
      const data = await fetchCommunity(address);
      setCommunity(data);

      // Load token info
      if (data?.cToken) {
        const tokenContract = new ethers.Contract(data.cToken, ERC20ABI, readProvider);
        const [name, symbol, decimals] = await Promise.all([
          tokenContract.name(),
          tokenContract.symbol(),
          tokenContract.decimals(),
        ]);
        setTokenInfo({ name, symbol, decimals: Number(decimals), address: data.cToken });
      }

      // Load reward rate
      if (calculator) {
        try {
          const rate = await calculator.getCurrentRewardRate(address);
          setRewardRate(rate);
        } catch {
          setRewardRate(0n);
        }
      }
    } catch (err) {
      console.error('Failed to load community:', err);
      toast.error('Failed to load community data');
    } finally {
      setLoading(false);
    }
  }, [address, readProvider, calculator]);

  useEffect(() => {
    loadCommunity();
  }, [loadCommunity]);

  const isOwner = isConnected && account && community?.owner?.id?.toLowerCase() === account.toLowerCase();

  // Admin actions
  const handleWithdrawRevenue = async () => {
    if (!signer) return;
    try {
      const contract = new ethers.Contract(address, [
        'function adminWithdrawRevenue()',
      ], signer);
      const tx = await contract.adminWithdrawRevenue();
      toast.info('Withdrawing revenue...');
      await tx.wait();
      toast.success('Revenue withdrawn!');
      loadCommunity();
    } catch (err) {
      toast.error(err.reason || err.message || 'Failed to withdraw revenue');
    }
  };

  if (loading) {
    return (
      <div className="page container">
        <div className="community-detail-skeleton">
          <div className="skeleton" style={{ width: '40%', height: 36, marginBottom: 16 }} />
          <div className="skeleton" style={{ width: '100%', height: 120, marginBottom: 24 }} />
          <div className="skeleton" style={{ width: '100%', height: 200 }} />
        </div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="page container">
        <div className="empty-state">
          <div className="empty-state-icon">❌</div>
          <div className="empty-state-title">Community not found</div>
          <div className="empty-state-desc">This community address doesn&apos;t exist on chain.</div>
          <Link to="/" className="btn btn-primary">Back to Home</Link>
        </div>
      </div>
    );
  }

  const activePools = community.pools?.filter(p => p.status === 'OPENED') || [];
  const closedPools = community.pools?.filter(p => p.status === 'CLOSED') || [];
  // Only show ERC20 staking & locking pools
  const displayPools = activeTab === 'pools' ? activePools : closedPools;
  const erc20Pools = displayPools.filter(p =>
    p.poolType === 'ERC20_STAKING' || p.poolType === 'ERC20_LOCKING'
  );
  const otherPools = displayPools.filter(p =>
    p.poolType !== 'ERC20_STAKING' && p.poolType !== 'ERC20_LOCKING'
  );

  return (
    <div className="page container">
      {/* ── Breadcrumb ── */}
      <nav className="breadcrumb">
        <Link to="/">Home</Link>
        <span className="breadcrumb-sep">/</span>
        <span>{community.name || `Community #${community.index?.toString()}`}</span>
      </nav>

      {/* ── Community Header ── */}
      <div className="community-header glass-card">
        <div className="community-header-top">
          {community.logo ? (
            <img src={community.logo} alt={community.name} className="community-header-avatar-img" />
          ) : (
            <div className="community-header-avatar">
              {community.tick?.slice(0, 2) || tokenInfo?.symbol?.slice(0, 2) || 'N'}
            </div>
          )}
          <div className="community-header-info">
            <h1 className="community-header-title">
              {community.name || `Community #${community.index?.toString()}`}
              {community.tick && <span className="community-detail-tick">${community.tick}</span>}
              {isOwner && <span className="badge badge-active" style={{ marginLeft: 8 }}>Owner</span>}
            </h1>
            <div className="community-header-address" onClick={() => { copyToClipboard(address); toast.info('Address copied!'); }}>
              {shortenAddress(address, 8)}
              <span style={{ fontSize: 12, opacity: 0.5, marginLeft: 4 }}>📋</span>
            </div>
            {community.description && (
              <div className="community-header-desc">{community.description}</div>
            )}
          </div>
          <div className="community-header-actions">
            {community.twitter && (
              <a href={`https://x.com/${community.twitter}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">𝕏</a>
            )}
            {community.telegram && (
              <a href={`https://t.me/${community.telegram}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">TG</a>
            )}
            <a href={getBscScanUrl(address)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
              BscScan ↗
            </a>
          </div>
        </div>

        <div className="community-info-grid">
          <div className="info-item">
            <span className="info-label">Community Token</span>
            <span className="info-value" style={{ fontFamily: 'monospace' }}>
              {tokenInfo ? `${tokenInfo.symbol} (${tokenInfo.name})` : shortenAddress(community.cToken)}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Owner</span>
            <span className="info-value" style={{ fontFamily: 'monospace' }}>{shortenAddress(community.owner?.id)}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Fee Ratio</span>
            <span className="info-value">{((community.feeRatio || 0) / 100).toFixed(1)}%</span>
          </div>
          <div className="info-item">
            <span className="info-label">Reward Rate</span>
            <span className="info-value">
              {rewardRate !== null ? `${formatTokenAmount(rewardRate, tokenInfo?.decimals || 18, 4)}/block` : '...'}
            </span>
          </div>
          <div className="info-item">
            <span className="info-label">Active Pools</span>
            <span className="info-value">{community.activePoolCount || 0}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Users</span>
            <span className="info-value">{community.usersCount || 0}</span>
          </div>
        </div>

        {/* Owner admin panel */}
        {isOwner && (
          <div className="admin-panel">
            <div className="admin-panel-header">
              <span>⚙️ Admin Controls</span>
            </div>
            <div className="admin-actions">
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddPool(true)}>
                + Add Pool
              </button>
              <button className="btn btn-success btn-sm" onClick={handleWithdrawRevenue}>
                Withdraw Revenue
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Pools Section ── */}
      <div style={{ marginTop: 'var(--space-8)' }}>
        <div className="tabs">
          <button className={`tab ${activeTab === 'pools' ? 'active' : ''}`} onClick={() => setActiveTab('pools')}>
            Active Pools ({activePools.length})
          </button>
          <button className={`tab ${activeTab === 'closed' ? 'active' : ''}`} onClick={() => setActiveTab('closed')}>
            Closed ({closedPools.length})
          </button>
          <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            History
          </button>
        </div>

        {activeTab === 'history' ? (
          <HistoryTab operations={community.operationHistory} />
        ) : erc20Pools.length === 0 && otherPools.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">No {activeTab === 'closed' ? 'closed' : 'active'} pools</div>
            <div className="empty-state-desc">
              {activeTab === 'pools' && isOwner ? 'Create your first staking pool!' : 'No pools to display.'}
            </div>
            {activeTab === 'pools' && isOwner && (
              <button className="btn btn-primary" onClick={() => setShowAddPool(true)}>+ Add Pool</button>
            )}
          </div>
        ) : (
          <div className="grid-pools">
            {erc20Pools.map(pool => (
              <PoolCard
                key={pool.id}
                pool={pool}
                communityAddress={address}
                communityToken={tokenInfo}
                rewardRate={rewardRate}
                isOwner={isOwner}
                onRefresh={loadCommunity}
              />
            ))}
            {otherPools.map(pool => (
              <div key={pool.id} className="glass-card" style={{ padding: 'var(--space-6)', opacity: 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>{pool.name || 'Pool'}</span>
                  <span className={getPoolTypeBadgeClass(pool.poolType)}>{getPoolTypeLabel(pool.poolType)}</span>
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                  This pool type is not yet supported in the frontend.
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add Pool Modal ── */}
      {showAddPool && (
        <AddPoolModal
          communityAddress={address}
          activePools={activePools}
          onClose={() => setShowAddPool(false)}
          onSuccess={() => { setShowAddPool(false); loadCommunity(); }}
        />
      )}
    </div>
  );
}

function HistoryTab({ operations }) {
  if (!operations || operations.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📜</div>
        <div className="empty-state-title">No history yet</div>
      </div>
    );
  }

  return (
    <div className="history-list">
      {operations.map(op => (
        <div key={op.id} className="history-item glass-card">
          <div className="history-type">
            <span className="badge badge-staking">{op.type}</span>
          </div>
          <div className="history-details">
            <span className="history-account">{shortenAddress(op.account?.id)}</span>
            {op.amount && op.amount !== '0' && (
              <span className="history-amount">{formatTokenAmount(op.amount)} tokens</span>
            )}
          </div>
          <div className="history-meta">
            <span>{formatDate(op.timestamp)}</span>
            <a href={getBscScanUrl(op.tx, 'tx')} target="_blank" rel="noopener noreferrer" className="history-tx">
              {shortenAddress(op.tx, 6)} ↗
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
