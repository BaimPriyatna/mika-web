import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadShopConfig } from './config.ts';
import type { ShopConfig } from './config.ts';
import { createShopHandler } from './http.ts';
import { VoucherIssuer } from './issuer.ts';
import { MidtransGateway } from './midtrans.ts';
import { ManagerRouterPort } from './router-port.ts';
import { ShopService } from './service.ts';
import { ShopStore } from './store.ts';
import { globalRouterManager } from '../router-manager.ts';

export interface ShopRuntime {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  service: ShopService;
  config: ShopConfig;
  stop: () => void;
}

/** Merakit seluruh komponen penjualan online dari environment server dan memulai retry latar belakang. */
export async function createShopRuntime(env: Record<string, string | undefined> = process.env): Promise<ShopRuntime> {
  const config = loadShopConfig(env);
  const store = await ShopStore.open(config.dataDir);
  const gateway = new MidtransGateway({
    serverKey: config.midtransServerKey,
    isProduction: config.midtransIsProduction,
    qrisAcquirer: config.midtransQrisAcquirer,
  });
  const issuer = new VoucherIssuer(new ManagerRouterPort(globalRouterManager, config.router));
  const service = new ShopService({ store, gateway, issuer, config });
  const handle = createShopHandler({ service, config, staticDir: env.SHOP_STATIC_DIR || 'shop' });
  const stopBackground = service.startBackground();

  return {
    handle,
    service,
    config,
    stop: () => {
      stopBackground();
      void store.flush();
    },
  };
}
