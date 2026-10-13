import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Voucher } from './pages/Voucher';
import { CetakVoucher } from './pages/CetakVoucher';
import { Paket } from './pages/Paket';
import { Profil } from './pages/Profil';
import { Perangkat } from './pages/Perangkat';
import { Setup } from './pages/Setup';
import { Pengaturan } from './pages/Pengaturan';
import { PenjualanOnline } from './pages/PenjualanOnline';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: 'voucher',
        element: <Voucher />,
      },
      {
        path: 'voucher/cetak/:batchId',
        element: <CetakVoucher />,
      },
      {
        path: 'paket',
        element: <Paket />,
      },
      {
        path: 'profil',
        element: <Profil />,
      },
      {
        path: 'perangkat',
        element: <Perangkat />,
      },
      {
        path: 'setup',
        element: <Setup />,
      },
      {
        path: 'penjualan',
        element: <PenjualanOnline />,
      },
      {
        path: 'pengaturan',
        element: <Pengaturan />,
      },
    ],
  },
]);
