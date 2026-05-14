import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Web3Provider } from './contexts/Web3Context';
import { ToastProvider } from './contexts/ToastContext';
import Header from './components/layout/Header';
import Home from './pages/Home';
import CommunityDetail from './pages/CommunityDetail';
import CreateCommunity from './pages/CreateCommunity';

export default function App() {
  return (
    <BrowserRouter>
      <Web3Provider>
        <ToastProvider>
          <Header />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/community/:address" element={<CommunityDetail />} />
            <Route path="/create" element={<CreateCommunity />} />
          </Routes>
          <footer style={{
            textAlign: 'center',
            padding: 'var(--space-8) var(--space-6)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            borderTop: '1px solid var(--color-border)',
          }}>
            <p>Nutbox Protocol · Community Staking on BNB Smart Chain</p>
            <p style={{ marginTop: 'var(--space-2)' }}>
              <a href="https://bscscan.com/address/0x5597e814399906095ecaA5769A40394F58E5E0Cf" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-tertiary)' }}>
                Contracts ↗
              </a>
            </p>
          </footer>
        </ToastProvider>
      </Web3Provider>
    </BrowserRouter>
  );
}
