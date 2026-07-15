import { useEffect, useState } from 'react'
import { usePolling } from './hooks/usePolling'
import { useTheme } from './hooks/useTheme'
import { useOnline } from './hooks/useOnline'
import { useInstallPrompt } from './hooks/useInstallPrompt'
import { useHashRoute } from './hooks/useHashRoute'
import { useAuth } from './hooks/useAuth'

import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Topbar from './components/Topbar'
import AlertToasts from './components/AlertToasts'
import OfflineBanner from './components/OfflineBanner'
import BinDetail from './components/BinDetail'

import DashboardView from './views/DashboardView'
import BinsView from './views/BinsView'
import MapView from './components/MapView'
import RouteView from './components/RouteView'
import AnalyticsView from './views/AnalyticsView'
import CollectionsView from './views/CollectionsView'
import AnomaliesView from './views/AnomaliesView'
import AdminView from './views/AdminView'
import SettingsView from './views/SettingsView'
import LoginView from './views/LoginView'

export default function App() {
  const { user, login, register, googleLogin, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()

  if (!user) return <LoginView onLogin={login} onRegister={register} onGoogle={googleLogin} />
  return <Shell user={user} onLogout={logout} theme={theme} toggleTheme={toggleTheme} />
}

function Shell({ user, onLogout, theme, toggleTheme }) {
  const { data: bins, error, loading, lastUpdated, refetch } = usePolling('/status', 10000)
  const online = useOnline()
  const { canInstall, promptInstall } = useInstallPrompt()
  const { route, navigate } = useHashRoute()

  const [detailBin, setDetailBin] = useState(null)

  const openBin = (bin) => setDetailBin(bin)
  const closeBin = () => setDetailBin(null)

  // Non-admins get bumped away from /admin
  useEffect(() => {
    if (route === 'admin' && user.role !== 'admin') navigate('dashboard')
  }, [route, user.role, navigate])

  return (
    <div className="shell">
      <Sidebar route={route} onNavigate={navigate} user={user} onLogout={onLogout} />
      <Topbar
        lastUpdated={lastUpdated} error={error} online={online}
        theme={theme} onToggleTheme={toggleTheme}
        canInstall={canInstall} onInstall={promptInstall}
        onRefresh={refetch}
      />
      <main className="shell-main">
        <div className="container">
          <OfflineBanner online={online} />
          <AlertToasts bins={bins} />
          {route === 'dashboard'   && <DashboardView bins={bins} loading={loading} onOpenBin={openBin} onNavigate={navigate} />}
          {route === 'bins'        && <BinsView bins={bins} loading={loading} onOpenBin={openBin} />}
          {route === 'map'         && <MapPage bins={bins} loading={loading} onOpen={openBin} />}
          {route === 'route'       && <RoutePage />}
          {route === 'analytics'   && <AnalyticsView bins={bins} loading={loading} />}
          {route === 'collections' && <CollectionsView bins={bins} />}
          {route === 'anomalies'   && <AnomaliesView bins={bins} />}
          {route === 'admin' && user.role === 'admin' && <AdminView bins={bins} onRefresh={refetch} user={user} />}
          {route === 'settings'    && <SettingsView theme={theme} onToggleTheme={toggleTheme} canInstall={canInstall} onInstall={promptInstall} onNavigate={navigate} user={user} onLogout={onLogout} />}
        </div>
      </main>
      <BottomNav route={route} onNavigate={navigate} />
      {detailBin && (
        <BinDetail
          bin={bins?.find((b) => b.id === detailBin.id) || detailBin}
          onClose={closeBin}
          onRefresh={refetch}
        />
      )}
    </div>
  )
}

function MapPage({ bins, loading, onOpen }) {
  return (
    <div className="stack">
      <div>
        <div className="page-title">Map</div>
        <div className="page-subtitle">All bins on the map · tap a pin for details</div>
      </div>
      {loading ? <div className="card skeleton" style={{ height: 400 }} /> : <MapView bins={bins || []} onOpen={onOpen} />}
    </div>
  )
}

function RoutePage() {
  return (
    <div className="stack">
      <div>
        <div className="page-title">Pickup route</div>
        <div className="page-subtitle">The best pickup order for your team</div>
      </div>
      <RouteView />
    </div>
  )
}
