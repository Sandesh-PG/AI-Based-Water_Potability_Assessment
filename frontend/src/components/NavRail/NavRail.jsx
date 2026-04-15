import { useLocation, useNavigate } from 'react-router-dom';
import './NavRail.css';

const TOP_ITEMS = [
  { id: 'home', icon: '⌂', label: 'Home' },
  { id: 'map', icon: '🗺', label: 'Map' },
  { id: 'forecast', icon: '📈', label: 'Forecast' },
  { id: 'stats', icon: '📊', label: 'Stats' },
  { id: 'batch', icon: '🧪', label: 'Batch' },
];

const BOTTOM_ITEMS = [{ id: 'ai', icon: '💬', label: 'AquaAI' }];

function NavRail() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeModule = pathname === '/' ? 'home' : pathname.replace('/', '');

  return (
    <nav className="nav-rail" aria-label="Primary modules">
      <div className="nav-rail-group">
        {TOP_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-rail-item ${activeModule === item.id ? 'active' : ''}`}
            onClick={() => navigate(item.id === 'home' ? '/' : `/${item.id}`)}
            title={item.label}
            aria-label={item.label}
          >
            <span className="nav-rail-icon" aria-hidden="true">{item.icon}</span>
          </button>
        ))}
      </div>

      <div className="nav-rail-group bottom">
        {BOTTOM_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-rail-item ${activeModule === item.id ? 'active' : ''}`}
            onClick={() => navigate(`/${item.id}`)}
            title={item.label}
            aria-label={item.label}
          >
            <span className="nav-rail-icon" aria-hidden="true">{item.icon}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export default NavRail;
