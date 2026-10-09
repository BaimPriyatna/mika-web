// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import { BinaryRouterClient } from '../binary-client.ts';
import { SentenceParser, encodeSentence } from '../binary-protocol.ts';

/**
 * RouterOS palsu: login, print dengan filter ?key=value, error !trap yang SELALU diikuti !done
 * seperti router asli, dan "unknown parameter" jika print menerima atribut =key=value.
 */
const SCHEDULERS = [
  { '.id': '*1', name: 'vm-cleaner', interval: '5m' },
  { '.id': '*2', name: 'vm-open', interval: '1d' },
  { '.id': '*3', name: 'other', interval: '1h' },
];
const PROFILES = [
  { '.id': '*A', name: 'default' },
  { '.id': '*B', name: '1jam' },
  { '.id': '*C', name: '3jam' },
];

interface FakeRouter {
  port: number;
  received: string[][];
  close: () => Promise<void>;
}

function reply(socket: net.Socket, sentences: string[][], chunkSize?: number) {
  const data = Buffer.concat(sentences.map(w => encodeSentence(w)));
  if (!chunkSize) {
    socket.write(data);
    return;
  }
  // kirim sepotong-sepotong untuk menguji pemotongan paket TCP
  for (let i = 0; i < data.length; i += chunkSize) {
    socket.write(data.subarray(i, i + chunkSize));
  }
}

function rows(list: Array<Record<string, string>>): string[][] {
  return list.map(r => ['!re', ...Object.entries(r).map(([k, v]) => `=${k}=${v}`)]);
}

async function startFakeRouter(opts: { chunkSize?: number } = {}): Promise<FakeRouter> {
  const received: string[][] = [];
  const server = net.createServer(socket => {
    const parser = new SentenceParser();
    socket.on('data', chunk => {
      parser.append(chunk);
      let sentence = parser.nextSentence();
      while (sentence) {
        const words = sentence.rawWords;
        received.push(words);
        const [cmd, ...rest] = words;
        const attrs = rest.filter(w => w.startsWith('=') && !w.startsWith('=.'));
        const queries = rest.filter(w => w.startsWith('?'));
        // balas dengan jeda acak: menguji bahwa balasan tidak tertukar antar perintah
        const delay = Math.floor(Math.random() * 15);
        setTimeout(() => {
          if (cmd === '/login') {
            reply(socket, [['!done']], opts.chunkSize);
          } else if (cmd === '/system/scheduler/print') {
            if (attrs.length > 0) {
              reply(socket, [['!trap', `=message=unknown parameter ${attrs[0].split('=')[1]}`], ['!done']], opts.chunkSize);
            } else {
              const filter = queries[0]?.slice(1).split('=');
              const list = filter ? SCHEDULERS.filter(r => (r as Record<string, string>)[filter[0]] === filter[1]) : SCHEDULERS;
              reply(socket, [...rows(list), ['!done']], opts.chunkSize);
            }
          } else if (cmd === '/ip/hotspot/user/profile/print') {
            reply(socket, [...rows(PROFILES), ['!done']], opts.chunkSize);
          } else if (cmd === '/ip/dhcp-server/lease/make-static') {
            reply(socket, [['!done']], opts.chunkSize);
          } else if (cmd === '/system/scheduler/add') {
            reply(socket, [['!done', '=ret=*9']], opts.chunkSize);
          } else {
            reply(socket, [['!trap', '=message=no such command'], ['!done']], opts.chunkSize);
          }
        }, delay);
        sentence = parser.nextSentence();
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    received,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

describe('BinaryRouterClient', () => {
  let router: FakeRouter;
  let client: BinaryRouterClient;

  beforeEach(async () => {
    router = await startFakeRouter();
    client = new BinaryRouterClient({ host: '127.0.0.1', port: router.port, username: 'u', password: 'p', timeoutMs: 3000 });
    await client.connect();
  });

  afterEach(async () => {
    client.close();
    await router.close();
  });

  it('filter print dikirim sebagai query ?key=value, bukan atribut (penyebab "unknown parameter")', async () => {
    const res = await client.print('/system/scheduler', { name: 'vm-cleaner' });
    expect(res).toEqual([{ '.id': '*1', name: 'vm-cleaner', interval: '5m' }]);
    const sent = router.received.find(w => w[0] === '/system/scheduler/print')!;
    expect(sent).toContain('?name=vm-cleaner');
    expect(sent.some(w => w.startsWith('=name='))).toBe(false);
  });

  it('print tanpa filter mengembalikan semua baris', async () => {
    expect(await client.print('/system/scheduler')).toHaveLength(3);
  });

  it('banyak perintah bersamaan tidak saling tertukar atau menggandakan data', async () => {
    const jobs: Array<Promise<unknown[]>> = [];
    for (let i = 0; i < 30; i++) {
      jobs.push(i % 2 === 0 ? client.print('/ip/hotspot/user/profile') : client.print('/system/scheduler'));
    }
    const results = await Promise.all(jobs);
    results.forEach((r, i) => {
      expect(r).toHaveLength(3);
      const first = r[0] as Record<string, string>;
      if (i % 2 === 0) expect(first.name).toBe('default');
      else expect(first.name).toBe('vm-cleaner');
    });
  });

  it('hasil print identik di setiap pemanggilan berulang (tidak berubah tiap refresh)', async () => {
    const first = await client.print('/ip/hotspot/user/profile');
    for (let i = 0; i < 10; i++) {
      expect(await client.print('/ip/hotspot/user/profile')).toEqual(first);
    }
  });

  it('!trap diikuti !done: error dilempar dan perintah berikutnya tetap mendapat balasannya sendiri', async () => {
    await expect(client.executeCommand('/nope/print')).rejects.toThrow(/no such command/);
    // tanpa membaca !done sisa trap, balasan berikut akan bergeser dan kosong
    const res = await client.print('/ip/hotspot/user/profile');
    expect(res).toHaveLength(3);
    expect(res[0].name).toBe('default');
  });

  it('error beruntun di tengah antrean tidak merusak perintah lain', async () => {
    const outcomes = await Promise.allSettled([
      client.print('/ip/hotspot/user/profile'),
      client.executeCommand('/nope/print'),
      client.print('/system/scheduler'),
      client.executeCommand('/nope2/print'),
      client.print('/ip/hotspot/user/profile'),
    ]);
    expect(outcomes.map(o => o.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'rejected', 'fulfilled']);
    expect((outcomes[0] as PromiseFulfilledResult<unknown[]>).value).toHaveLength(3);
    expect((outcomes[2] as PromiseFulfilledResult<Array<Record<string, string>>>).value[0].name).toBe('vm-cleaner');
    expect((outcomes[4] as PromiseFulfilledResult<unknown[]>).value).toHaveLength(3);
  });

  it('add mengembalikan id dari ret', async () => {
    expect(await client.add('/system/scheduler', { name: 'x', interval: '1d' })).toBe('*9');
  });

  it('call menjalankan perintah non-print dengan atribut =.id=', async () => {
    await client.call('/ip/dhcp-server/lease/make-static', { '.id': '*5' });
    const sent = router.received.find(w => w[0] === '/ip/dhcp-server/lease/make-static')!;
    expect(sent).toContain('=.id=*5');
    expect(router.received.some(w => w[0].endsWith('/print') && w[0].includes('make-static'))).toBe(false);
  });
});

describe('BinaryRouterClient dengan paket TCP terpotong-potong', () => {
  it('membaca balasan yang dikirim 1-3 byte per paket tanpa duplikat', async () => {
    const router = await startFakeRouter({ chunkSize: 3 });
    const client = new BinaryRouterClient({ host: '127.0.0.1', port: router.port, username: 'u', password: 'p', timeoutMs: 3000 });
    await client.connect();
    const [a, b] = await Promise.all([client.print('/ip/hotspot/user/profile'), client.print('/system/scheduler')]);
    expect(a.map(r => r.name)).toEqual(['default', '1jam', '3jam']);
    expect(b.map(r => r.name)).toEqual(['vm-cleaner', 'vm-open', 'other']);
    client.close();
    await router.close();
  });
});
