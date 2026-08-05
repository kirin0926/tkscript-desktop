import './styles/app.css'
import { AdminLayout } from '@/app/components/layout/AdminLayout'
import { Toaster } from '@/app/components/ui/sonner'

export default function App() {
  return (
    <>
      <AdminLayout />
      <Toaster position="bottom-right" />
    </>
  )
}