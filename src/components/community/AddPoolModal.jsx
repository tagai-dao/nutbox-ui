import { useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../../contexts/Web3Context';
import { useToast } from '../../contexts/ToastContext';
import { CONTRACTS } from '../../config/contracts';
import { CommunityABI } from '../../config/abis';

export default function AddPoolModal({ communityAddress, activePools, onClose, onSuccess }) {
  const { signer, readProvider } = useWeb3();
  const toast = useToast();

  const [poolType, setPoolType] = useState('staking');
  const [poolName, setPoolName] = useState('');
  const [stakeTokenAddress, setStakeTokenAddress] = useState('');
  const [lockDuration, setLockDuration] = useState('');
  const [ratios, setRatios] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!signer || !poolName || !stakeTokenAddress) {
      toast.error('Please fill in all fields');
      return;
    }

    if (!ethers.isAddress(stakeTokenAddress)) {
      toast.error('Invalid token address');
      return;
    }

    setLoading(true);
    try {
      const communityContract = new ethers.Contract(communityAddress, CommunityABI, signer);
      const committeeContract = new ethers.Contract(CONTRACTS.Committee, [
        'function getCommunitySettingsFee() view returns (uint256)',
      ], readProvider);

      const fee = await committeeContract.getCommunitySettingsFee();

      // Parse ratios: new pool ratio is appended
      // Total active pools + 1 = number of ratio entries needed
      let ratioArr;
      if (ratios.trim()) {
        ratioArr = ratios.split(',').map(r => parseInt(r.trim()));
      } else {
        // Default: equal distribution
        const numPools = activePools.length + 1;
        const eachRatio = Math.floor(10000 / numPools);
        ratioArr = Array(numPools).fill(eachRatio);
        // Fix rounding: add remainder to last pool
        ratioArr[ratioArr.length - 1] += 10000 - eachRatio * numPools;
      }

      // Ensure correct length
      if (ratioArr.length !== activePools.length + 1) {
        toast.error(`Need ${activePools.length + 1} ratio values (current pools + new pool)`);
        setLoading(false);
        return;
      }

      const ratioSum = ratioArr.reduce((a, b) => a + b, 0);
      if (ratioSum !== 10000 && ratioSum !== 0) {
        toast.error(`Ratios must sum to 10000 (currently ${ratioSum})`);
        setLoading(false);
        return;
      }

      let factoryAddress;
      let meta;

      if (poolType === 'staking') {
        factoryAddress = CONTRACTS.ERC20StakingFactory;
        // meta: just the stake token address (20 bytes)
        meta = stakeTokenAddress.toLowerCase();
      } else {
        factoryAddress = CONTRACTS.ERC20LockingFactory;
        // meta: [address stakeToken (20 bytes)][uint256 lockDuration (32 bytes)]
        if (!lockDuration || parseInt(lockDuration) <= 0) {
          toast.error('Lock duration must be positive');
          setLoading(false);
          return;
        }
        const durationSeconds = parseInt(lockDuration) * 86400; // Convert days to seconds
        meta = stakeTokenAddress.toLowerCase() + ethers.toBeHex(durationSeconds, 32).replace('0x', '');
      }

      const tx = await communityContract.adminAddPool(
        poolName,
        ratioArr,
        factoryAddress,
        meta,
        { value: fee }
      );

      toast.info('Creating pool...');
      await tx.wait();
      toast.success('Pool created successfully!');
      onSuccess?.();
    } catch (err) {
      console.error('Create pool failed:', err);
      toast.error(err.reason || err.message || 'Failed to create pool');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add New Pool</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Pool Type */}
          <div className="input-group">
            <label>Pool Type</label>
            <select className="input" value={poolType} onChange={e => setPoolType(e.target.value)}>
              <option value="staking">ERC20 Staking</option>
              <option value="locking">ERC20 Locking</option>
            </select>
          </div>

          {/* Pool Name */}
          <div className="input-group">
            <label>Pool Name</label>
            <input
              className="input"
              placeholder="e.g. Stake USDT for rewards"
              value={poolName}
              onChange={e => setPoolName(e.target.value)}
            />
          </div>

          {/* Stake Token */}
          <div className="input-group">
            <label>Stake Token Address</label>
            <input
              className="input"
              placeholder="0x..."
              value={stakeTokenAddress}
              onChange={e => setStakeTokenAddress(e.target.value)}
            />
          </div>

          {/* Lock Duration (only for locking) */}
          {poolType === 'locking' && (
            <div className="input-group">
              <label>Lock Duration (days)</label>
              <input
                type="number"
                className="input"
                placeholder="e.g. 30"
                value={lockDuration}
                onChange={e => setLockDuration(e.target.value)}
                min="1"
              />
            </div>
          )}

          {/* Ratios */}
          <div className="input-group">
            <label>
              Pool Ratios (comma-separated, must sum to 10000)
              <br />
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
                Leave empty for equal distribution. Need {activePools.length + 1} values.
              </span>
            </label>
            <input
              className="input"
              placeholder={`e.g. ${Array(activePools.length + 1).fill(Math.floor(10000 / (activePools.length + 1))).join(', ')}`}
              value={ratios}
              onChange={e => setRatios(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={handleCreate}
            disabled={loading || !poolName || !stakeTokenAddress}
            style={{ width: '100%' }}
          >
            {loading ? (
              <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating...</>
            ) : (
              'Create Pool'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
