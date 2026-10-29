import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext.jsx'
import { PublicOnly, RequireAuth } from './auth/RequireAuth.jsx'
import { AppLayout } from './components/AppLayout.jsx'
import { SplashScreen } from './components/Loading.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { Accounts } from './pages/Accounts.jsx'
import { Budgets } from './pages/Budgets.jsx'
import { Categories } from './pages/Categories.jsx'
import { Debts } from './pages/Debts.jsx'
import { Goals } from './pages/Goals.jsx'
import { Login } from './pages/Login.jsx'
import { NotFound } from './pages/NotFound.jsx'
import { Register } from './pages/Register.jsx'
import { Subscriptions } from './pages/Subscriptions.jsx'
import { Transactions } from './pages/Transactions.jsx'
import { VerifyOtp } from './pages/VerifyOtp.jsx'

const Dashboard = lazy(() =>
  import('./pages/Dashboard.jsx').then((module) => ({ default: module.Dashboard })),
)

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Suspense fallback={<SplashScreen />}>
          <Routes>
            <Route element={<PublicOnly />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-otp" element={<VerifyOtp />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/budgets" element={<Budgets />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/debts" element={<Debts />} />
                <Route path="/subscriptions" element={<Subscriptions />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </AuthProvider>
  )
}
