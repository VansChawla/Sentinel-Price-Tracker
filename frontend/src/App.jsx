import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

// Connect to your Node.js backend
const socket = io('http://localhost:5000');

// NOTE: move this to a .env file before deploying (REACT_APP_USER_TOKEN)
// and read it with process.env.REACT_APP_USER_TOKEN — never ship a real
// token in committed source, especially on a public GitHub repo.
const USER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyLCJpYXQiOjE3ODM2OTg4MzYsImV4cCI6MTc4MzcwMjQzNn0.AivYQXOYll2SZcqDAyYxSOnGOwVFhTe_tF51pxwP0Bs";

// ---- tiny inline icons (zero extra dependencies) ----
const Icon = ({ path, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);
const icons = {
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
  flat: 'M5 12h14',
  link: 'M10 13a5 5 0 007.07 0l1.93-1.93a5 5 0 00-7.07-7.07L10.5 5.5M14 11a5 5 0 00-7.07 0L5 12.93a5 5 0 007.07 7.07L13.5 18.5',
  plus: 'M12 5v14M5 12h14',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z',
};

function trend(current, previous) {
  if (current == null) return 'pending';
  if (previous == null || current === previous) return 'flat';
  return current < previous ? 'down' : 'up';
}

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [products, setProducts] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/products', {
        headers: { token: USER_TOKEN }
      });
      setProducts(response.data);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post('http://localhost:5000/api/products',
        {
          product_name: newName,
          url: newUrl,
          target_price: 0
        },
        { headers: { token: USER_TOKEN } }
      );

      setNewUrl('');
      setNewName('');
      fetchProducts();
    } catch (error) {
      console.error("Error adding product:", error);
      toast.error("Couldn't add that item. Check your token and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchProducts();

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('price_updated', (data) => {
      setProducts((prevProducts) => {
        const product = prevProducts.find(p => p.id === data.product_id);

        if (product) {
          if (product.current_price && data.price < product.current_price) {
            toast.success(`Price drop — ${product.product_name} is now ₹${data.price.toLocaleString('en-IN')}`);
          } else {
            toast.info(`${product.product_name} refreshed — ₹${data.price.toLocaleString('en-IN')}`);
          }
        }

        return prevProducts.map((p) =>
          p.id === data.product_id
            ? { ...p, previous_price: p.current_price ?? null, current_price: data.price }
            : p
        );
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('price_updated');
    };
  }, []);

  const trackedCount = products.length;
  const dropsToday = products.filter(p => trend(p.current_price, p.previous_price) === 'down').length;

  return (
    <div className="app-shell">
      <ToastContainer position="top-right" autoClose={4000} theme="dark" toastClassName="st-toast" />

      <header className="topbar">
        <div className="brand">
          <span className={`brand-dot ${isConnected ? 'is-live' : ''}`} />
          <div>
            <h1>Sentinel</h1>
            <p className="brand-sub">Standing watch over your prices</p>
          </div>
        </div>
        <span className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
          <span className="status-dot" />
          {isConnected ? 'Live' : 'Reconnecting'}
        </span>
      </header>

      {trackedCount > 0 && (
        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[...products, ...products].map((p, i) => {
              const t = trend(p.current_price, p.previous_price);
              return (
                <span className={`ticker-item t-${t}`} key={`${p.id}-${i}`}>
                  {p.product_name}
                  <b>{p.current_price != null ? `₹${p.current_price.toLocaleString('en-IN')}` : '—'}</b>
                  {t !== 'pending' && <Icon path={icons[t]} size={13} />}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <main className="content">
        <section className="stats-row">
          <div className="stat-card">
            <span className="stat-label">Tracked items</span>
            <span className="stat-value">{trackedCount}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Prices dropping</span>
            <span className="stat-value accent-down">{dropsToday}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Connection</span>
            <span className={`stat-value ${isConnected ? 'accent-down' : 'accent-up'}`}>
              {isConnected ? 'Online' : 'Offline'}
            </span>
          </div>
        </section>

        <section className="add-card">
          <h2>Track a new item</h2>
          <form onSubmit={handleAddProduct} className="add-form">
            <input
              type="text"
              placeholder="Product name — e.g. PS5 Slim 1TB"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <input
              type="url"
              placeholder="Paste the product URL"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              required
            />
            <button type="submit" disabled={submitting}>
              <Icon path={icons.plus} size={16} />
              {submitting ? 'Adding…' : 'Track item'}
            </button>
          </form>
        </section>

        <section className="grid-section">
          <h2>Your tracked items</h2>

          {products.length === 0 ? (
            <div className="empty-state">
              <Icon path={icons.inbox} size={28} />
              <p>No items tracked yet.</p>
              <span>Add a product above to start watching its price.</span>
            </div>
          ) : (
            <div className="product-grid">
              {products.map(product => {
                const t = trend(product.current_price, product.previous_price);
                return (
                  <article className={`product-card edge-${t}`} key={product.id}>
                    <div className="product-top">
                      <h3>{product.product_name}</h3>
                      <a href={product.url} target="_blank" rel="noreferrer" aria-label="View on store">
                        <Icon path={icons.link} size={15} />
                      </a>
                    </div>

                    <div className="product-bottom">
                      <span className="price">
                        {product.current_price != null
                          ? `₹${product.current_price.toLocaleString('en-IN')}`
                          : '—'}
                      </span>
                      <span className={`trend-tag tag-${t}`}>
                        {t !== 'pending' && <Icon path={icons[t]} size={12} />}
                        {t === 'pending' ? 'Watching' : t === 'down' ? 'Dropped' : t === 'up' ? 'Rose' : 'Steady'}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
