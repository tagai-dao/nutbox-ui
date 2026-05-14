import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { CHAIN_ID, BSC_CONFIG } from '../config/contracts';

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Read-only provider for querying on-chain data
  const readProvider = new ethers.JsonRpcProvider(BSC_CONFIG.rpcUrls[0], CHAIN_ID);

  const isCorrectChain = chainId === CHAIN_ID;

  const switchToBSC = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BSC_CONFIG.chainId }],
      });
    } catch (switchError) {
      // Chain not added yet
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [BSC_CONFIG],
        });
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask to continue');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send('eth_requestAccounts', []);
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      setProvider(browserProvider);
      setAccount(accounts[0]);
      setChainId(currentChainId);

      if (currentChainId !== CHAIN_ID) {
        await switchToBSC();
      }

      const walletSigner = await browserProvider.getSigner();
      setSigner(walletSigner);
    } catch (err) {
      console.error('Connection failed:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  }, [switchToBSC]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setError(null);
  }, []);

  // Listen for MetaMask events
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setAccount(accounts[0]);
        // Re-create signer
        if (provider) {
          provider.getSigner().then(setSigner).catch(console.error);
        }
      }
    };

    const handleChainChanged = (newChainId) => {
      setChainId(Number(newChainId));
      // Refresh provider/signer on chain change
      if (window.ethereum) {
        const bp = new ethers.BrowserProvider(window.ethereum);
        setProvider(bp);
        bp.getSigner().then(setSigner).catch(console.error);
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    // Auto-reconnect if previously connected
    window.ethereum.request({ method: 'eth_accounts' }).then((accounts) => {
      if (accounts.length > 0) {
        connect();
      }
    }).catch(console.error);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  const value = {
    account,
    provider,
    signer,
    chainId,
    connecting,
    error,
    isCorrectChain,
    isConnected: !!account,
    readProvider,
    connect,
    disconnect,
    switchToBSC,
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) throw new Error('useWeb3 must be used within Web3Provider');
  return context;
}
