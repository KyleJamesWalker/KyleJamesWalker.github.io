import './app.css';
import { createRoot } from 'react-dom/client';
import App from '../../assets/js/cardboard-slicer.jsx';

const root = document.getElementById('cardboard-slicer-root');
if (root) {
  createRoot(root).render(<App />);
}
