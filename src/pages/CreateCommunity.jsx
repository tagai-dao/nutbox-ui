import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useToast } from '../contexts/ToastContext';
import { CONTRACTS } from '../config/contracts';
import { CommunityFactoryABI, ERC20ABI } from '../config/abis';
import { encodeMintableTokenMeta, encodeDistributionPolicy } from '../utils/helpers';
import './CreateCommunity.css';

// Format a Date to datetime-local string (YYYY-MM-DDTHH:mm:ss)
function toDatetimeLocal(date) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Returns the next full hour after now
function getNextFullHour() {
  const now = new Date();
  // Advance to the next hour (ceil to hour)
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return toDatetimeLocal(next);
}

export default function CreateCommunity() {
  const { account, signer, readProvider, isConnected } = useWeb3();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Token config
  const [tokenMode, setTokenMode] = useState('mintable'); // 'mintable' or 'existing'
  const [existingToken, setExistingToken] = useState('');
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenSymbol, setNewTokenSymbol] = useState('');
  const [newTokenSupply, setNewTokenSupply] = useState('1000000');

  // Step 2: Distribution policy (time-based only)
  const [eras, setEras] = useState([{
    startDate: getNextFullHour(),
    endDate: '',
    rewardPerSecond: '',
  }]);

  const addEra = () => {
    const prev = eras[eras.length - 1];
    let newStartDate = '';
    if (prev?.endDate) {
      // Set new era start = previous era end + 1 second
      const prevEnd = new Date(prev.endDate);
      prevEnd.setSeconds(prevEnd.getSeconds() + 1);
      newStartDate = toDatetimeLocal(prevEnd);
    }
    setEras([...eras, { startDate: newStartDate, endDate: '', rewardPerSecond: '' }]);
  };

  const updateEra = (index, field, value) => {
    const newEras = [...eras];
    newEras[index][field] = value;
    setEras(newEras);
  };

  const removeEra = (index) => {
    if (eras.length <= 1) return;
    setEras(eras.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!signer || !account) {
      toast.error('Please connect your wallet');
      return;
    }

    // Validate eras
    for (let i = 0; i < eras.length; i++) {
      const era = eras[i];
      if (!era.startDate || !era.endDate || !era.rewardPerSecond) {
        toast.error(`Era ${i + 1}: All fields are required`);
        return;
      }
      const startTs = Math.floor(new Date(era.startDate).getTime() / 1000);
      const endTs = Math.floor(new Date(era.endDate).getTime() / 1000);
      if (startTs >= endTs) {
        toast.error(`Era ${i + 1}: End date must be after start date`);
        return;
      }
    }

    setLoading(true);
    try {
      const factory = new ethers.Contract(CONTRACTS.CommunityFactory, CommunityFactoryABI, signer);
      const committeeContract = new ethers.Contract(CONTRACTS.Committee, [
        'function getCreateCommunityFee() view returns (uint256)',
      ], readProvider);

      const fee = await committeeContract.getCreateCommunityFee();

      // Always use time-based calculator
      const calculatorAddr = CONTRACTS.LinearTimeCalculator;

      // Encode distribution policy (convert dates to unix timestamps)
      const policyEras = eras.map(era => ({
        startBlock: BigInt(Math.floor(new Date(era.startDate).getTime() / 1000)),
        stopBlock: BigInt(Math.floor(new Date(era.endDate).getTime() / 1000)),
        rewardPerBlock: ethers.parseEther(era.rewardPerSecond),
      }));
      const policy = encodeDistributionPolicy(policyEras);

      let isMintable, communityToken, communityTokenFactory, tokenMeta;

      if (tokenMode === 'mintable') {
        if (!newTokenName || !newTokenSymbol || !newTokenSupply) {
          toast.error('Token name, symbol, and supply are required');
          setLoading(false);
          return;
        }
        isMintable = true;
        communityToken = ethers.ZeroAddress;
        communityTokenFactory = CONTRACTS.MintableERC20Factory;
        tokenMeta = encodeMintableTokenMeta(newTokenName, newTokenSymbol, newTokenSupply, account);
      } else {
        if (!existingToken || !ethers.isAddress(existingToken)) {
          toast.error('Valid token address is required');
          setLoading(false);
          return;
        }
        isMintable = false;
        communityToken = existingToken;
        communityTokenFactory = ethers.ZeroAddress;
        tokenMeta = '0x';
      }

      toast.info('Creating community...');

      const tx = await factory.createCommunity(
        isMintable,
        communityToken,
        communityTokenFactory,
        tokenMeta,
        calculatorAddr,
        policy,
        { value: fee }
      );

      const receipt = await tx.wait();

      // Find CommunityCreated event
      const iface = new ethers.Interface(CommunityFactoryABI);
      let communityAddress;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'CommunityCreated') {
            communityAddress = parsed.args[1]; // community address
            break;
          }
        } catch { /* skip other contract logs */ }
      }

      toast.success('Community created successfully!');

      if (communityAddress) {
        navigate(`/community/${communityAddress}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error('Create community failed:', err);
      toast.error(err.reason || err.message || 'Failed to create community');
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="page container">
        <div className="empty-state">
          <div className="empty-state-icon">🔗</div>
          <div className="empty-state-title">Connect Wallet</div>
          <div className="empty-state-desc">Please connect your wallet to create a community.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <div className="create-wrapper">
        <h1 className="create-title">
          Create <span className="gradient-text">Community</span>
        </h1>
        <p className="create-subtitle">
          Deploy your own staking economy with custom reward distribution.
        </p>

        {/* Step indicators */}
        <div className="steps-indicator">
          <div className={`step-dot ${step >= 1 ? 'active' : ''}`} onClick={() => setStep(1)}>
            <span>1</span>
            <label>Token</label>
          </div>
          <div className="step-line" />
          <div className={`step-dot ${step >= 2 ? 'active' : ''}`} onClick={() => step >= 1 && setStep(2)}>
            <span>2</span>
            <label>Rewards</label>
          </div>
          <div className="step-line" />
          <div className={`step-dot ${step >= 3 ? 'active' : ''}`}>
            <span>3</span>
            <label>Confirm</label>
          </div>
        </div>

        {/* Step 1: Token Configuration */}
        {step === 1 && (
          <div className="create-step glass-card">
            <h2 className="step-title">Token Configuration</h2>

            <div className="token-mode-selector">
              <button
                className={`token-mode-btn ${tokenMode === 'mintable' ? 'active' : ''}`}
                onClick={() => setTokenMode('mintable')}
              >
                <span className="token-mode-icon">🪙</span>
                <span className="token-mode-label">Create New Token</span>
                <span className="token-mode-desc">Deploy a new mintable ERC20</span>
              </button>
              <button
                className={`token-mode-btn ${tokenMode === 'existing' ? 'active' : ''}`}
                onClick={() => setTokenMode('existing')}
              >
                <span className="token-mode-icon">📎</span>
                <span className="token-mode-label">Use Existing Token</span>
                <span className="token-mode-desc">Provide rewards from your token balance</span>
              </button>
            </div>

            {tokenMode === 'mintable' ? (
              <div className="form-fields">
                <div className="input-group">
                  <label>Token Name</label>
                  <input className="input" placeholder="e.g. My Community Token" value={newTokenName} onChange={e => setNewTokenName(e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Token Symbol</label>
                  <input className="input" placeholder="e.g. MCT" value={newTokenSymbol} onChange={e => setNewTokenSymbol(e.target.value)} />
                </div>
                <div className="input-group">
                  <label>Initial Supply (tokens)</label>
                  <input type="number" className="input" placeholder="1000000" value={newTokenSupply} onChange={e => setNewTokenSupply(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="form-fields">
                <div className="input-group">
                  <label>Token Address</label>
                  <input className="input" placeholder="0x..." value={existingToken} onChange={e => setExistingToken(e.target.value)} />
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', padding: 'var(--space-3)' }}>
                  ⚠️ You must transfer enough reward tokens to the community contract after creation.
                </div>
              </div>
            )}

            <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 'var(--space-4)' }} onClick={() => setStep(2)}>
              Next: Configure Rewards →
            </button>
          </div>
        )}

        {/* Step 2: Distribution Eras (time-based) */}
        {step === 2 && (
          <div className="create-step glass-card">
            <h2 className="step-title">Reward Distribution</h2>

            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', padding: 'var(--space-3) var(--space-4)', background: 'rgba(59, 130, 246, 0.06)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-6)' }}>
              ⏱️ Time-based linear distribution — rewards are calculated per second between start and end dates.
            </div>

            {eras.map((era, index) => (
              <div key={index} className="era-card">
                <div className="era-header">
                  <span>Era {index + 1}</span>
                  {eras.length > 1 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => removeEra(index)} style={{ color: 'var(--color-red)' }}>Remove</button>
                  )}
                </div>
                <div className="era-fields">
                  <div className="input-group">
                    <label>Start Date</label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={era.startDate}
                      onChange={e => updateEra(index, 'startDate', e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label>End Date</label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={era.endDate}
                      onChange={e => updateEra(index, 'endDate', e.target.value)}
                    />
                  </div>
                  <div className="input-group">
                    <label>Reward per Second (tokens)</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="e.g. 0.01"
                      value={era.rewardPerSecond}
                      onChange={e => updateEra(index, 'rewardPerSecond', e.target.value)}
                      step="any"
                    />
                  </div>
                </div>
                {era.startDate && era.endDate && era.rewardPerSecond && (
                  <div className="era-summary">
                    Duration: {Math.round((new Date(era.endDate) - new Date(era.startDate)) / 86400000)} days
                    {' · '}
                    Total Rewards: {(
                      ((new Date(era.endDate) - new Date(era.startDate)) / 1000) * parseFloat(era.rewardPerSecond || 0)
                    ).toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
                  </div>
                )}
              </div>
            ))}

            <button className="btn btn-ghost" onClick={addEra} style={{ width: '100%', marginTop: 'var(--space-3)' }}>
              + Add Era
            </button>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
              <button className="btn btn-secondary btn-lg" onClick={() => setStep(1)} style={{ flex: 1 }}>
                ← Back
              </button>
              <button className="btn btn-primary btn-lg" onClick={() => setStep(3)} style={{ flex: 2 }}>
                Next: Confirm →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="create-step glass-card">
            <h2 className="step-title">Confirm & Create</h2>

            <div className="confirm-summary">
              <div className="confirm-row">
                <span className="confirm-label">Token Mode</span>
                <span className="confirm-value">{tokenMode === 'mintable' ? 'New Mintable Token' : 'Existing Token'}</span>
              </div>
              {tokenMode === 'mintable' ? (
                <>
                  <div className="confirm-row">
                    <span className="confirm-label">Token</span>
                    <span className="confirm-value">{newTokenName} ({newTokenSymbol})</span>
                  </div>
                  <div className="confirm-row">
                    <span className="confirm-label">Initial Supply</span>
                    <span className="confirm-value">{Number(newTokenSupply).toLocaleString()}</span>
                  </div>
                </>
              ) : (
                <div className="confirm-row">
                  <span className="confirm-label">Token Address</span>
                  <span className="confirm-value" style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>{existingToken}</span>
                </div>
              )}
              <div className="confirm-row">
                <span className="confirm-label">Calculator</span>
                <span className="confirm-value">Linear (time-based)</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Distribution Eras</span>
                <span className="confirm-value">{eras.length}</span>
              </div>
              {eras.map((era, i) => (
                <div key={i} className="confirm-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)' }}>
                  <span className="confirm-label">Era {i + 1}</span>
                  <span className="confirm-value" style={{ fontSize: 'var(--font-size-xs)' }}>
                    {era.startDate ? new Date(era.startDate).toLocaleString() : '—'}
                    {' → '}
                    {era.endDate ? new Date(era.endDate).toLocaleString() : '—'}
                    {' · '}
                    {era.rewardPerSecond || '0'} tokens/sec
                  </span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', padding: 'var(--space-3)', background: 'var(--color-bg-glass)', borderRadius: 'var(--radius-sm)', marginTop: 'var(--space-4)' }}>
              💰 A creation fee (Tier 1) will be charged in BNB. This fee goes to the protocol treasury.
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
              <button className="btn btn-secondary btn-lg" onClick={() => setStep(2)} style={{ flex: 1 }}>
                ← Back
              </button>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleCreate}
                disabled={loading}
                style={{ flex: 2 }}
              >
                {loading ? (
                  <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating...</>
                ) : (
                  '🚀 Create Community'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
