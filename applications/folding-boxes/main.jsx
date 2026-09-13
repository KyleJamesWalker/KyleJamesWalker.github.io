import './app.css';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const root = document.getElementById('folding-boxes-root');
if (root) {
  createRoot(root).render(<App />);
}
