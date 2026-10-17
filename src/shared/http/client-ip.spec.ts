import { afterEach, describe, expect, it } from 'vitest';
import {
  ClientIpRequest,
  clientIpForAudit,
  parseTrustedProxyHops,
  resolveClientIp,
} from './client-ip';

const SOCKET_IP = '172.18.0.5'; // o Traefik, na rede docker
const CLIENT_IP = '203.0.113.7';

function request(xff?: string | string[], ip: string | undefined = SOCKET_IP): ClientIpRequest {
  return { headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, ip };
}

describe('CC-025 — resolveClientIp', () => {
  describe('1 salto (só o Traefik, o padrão)', () => {
    it('usa o IP que o Traefik acrescentou, o último da lista', () => {
      expect(resolveClientIp(request(CLIENT_IP), 1)).toBe(CLIENT_IP);
    });

    it('XFF forjado à esquerda não muda o rastreador', () => {
      const forgeries = ['1.1.1.1', '1.1.1.1, 2.2.2.2', '10.0.0.1, ::1, 9.9.9.9', 'lixo, ,'];
      for (const forged of forgeries) {
        expect(resolveClientIp(request(`${forged}, ${CLIENT_IP}`), 1)).toBe(CLIENT_IP);
      }
    });

    it('cabeçalho repetido (array) vale como uma lista só', () => {
      expect(resolveClientIp(request(['1.1.1.1', CLIENT_IP]), 1)).toBe(CLIENT_IP);
    });
  });

  describe('0 saltos (API exposta direto)', () => {
    it('ignora o XFF e usa o socket', () => {
      expect(resolveClientIp(request(`1.1.1.1, ${CLIENT_IP}`), 0)).toBe(SOCKET_IP);
    });
  });

  describe('2 saltos (Cloudflare na frente do Traefik)', () => {
    const CLOUDFLARE_EDGE = '172.70.1.1';

    it('usa o IP que a Cloudflare acrescentou, o penúltimo', () => {
      expect(resolveClientIp(request(`${CLIENT_IP}, ${CLOUDFLARE_EDGE}`), 2)).toBe(CLIENT_IP);
    });

    it('XFF forjado à esquerda não muda o rastreador', () => {
      expect(
        resolveClientIp(request(`6.6.6.6, 7.7.7.7, ${CLIENT_IP}, ${CLOUDFLARE_EDGE}`), 2),
      ).toBe(CLIENT_IP);
    });

    it('lista mais curta que N (veio direto ao Traefik): o item que existe', () => {
      expect(resolveClientIp(request(CLIENT_IP), 2)).toBe(CLIENT_IP);
    });
  });

  describe('sem XFF ou com lista vazia', () => {
    it('sem cabeçalho usa req.ip', () => {
      expect(resolveClientIp(request(undefined), 1)).toBe(SOCKET_IP);
    });

    it('cabeçalho vazio ou só com vírgulas e espaços usa req.ip', () => {
      for (const empty of ['', '   ', ' , ,, ']) {
        expect(resolveClientIp(request(empty), 1)).toBe(SOCKET_IP);
      }
    });

    it('sem req.ip cai no endereço do socket', () => {
      const req: ClientIpRequest = { headers: {}, socket: { remoteAddress: SOCKET_IP } };
      expect(resolveClientIp(req, 1)).toBe(SOCKET_IP);
    });

    it('sem nenhum endereço devolve "unknown"', () => {
      expect(resolveClientIp({ headers: {} }, 1)).toBe('unknown');
    });
  });

  it('ignora espaços em volta dos itens', () => {
    expect(resolveClientIp(request(`  1.1.1.1 ,   ${CLIENT_IP}   `), 1)).toBe(CLIENT_IP);
  });

  it('aceita IPv6', () => {
    expect(resolveClientIp(request('1.1.1.1, 2001:db8::1'), 1)).toBe('2001:db8::1');
    expect(resolveClientIp(request('2001:db8::dead, 2001:db8::1, 2606:4700::1'), 2)).toBe(
      '2001:db8::1',
    );
  });

  it('item que não é IP na posição escolhida cai no socket (restringe, não libera)', () => {
    expect(resolveClientIp(request(`${CLIENT_IP}, not-an-ip`), 1)).toBe(SOCKET_IP);
  });
});

describe('CC-025 — parseTrustedProxyHops', () => {
  it('ausente ou vazio: padrão 1, sem aviso', () => {
    expect(parseTrustedProxyHops(undefined)).toEqual({ hops: 1, rejected: null });
    expect(parseTrustedProxyHops('  ')).toEqual({ hops: 1, rejected: null });
  });

  it('aceita inteiros >= 0, com espaços', () => {
    expect(parseTrustedProxyHops('0')).toEqual({ hops: 0, rejected: null });
    expect(parseTrustedProxyHops(' 2 ')).toEqual({ hops: 2, rejected: null });
  });

  it('valor inválido: padrão 1 e devolve o valor para o aviso', () => {
    for (const raw of ['abc', '-1', '1.5', '1e2', '2 saltos', '99999999999999999999']) {
      expect(parseTrustedProxyHops(raw)).toEqual({ hops: 1, rejected: raw });
    }
  });
});

describe('CC-026 — clientIpForAudit', () => {
  const originalHops = process.env.TRUSTED_PROXY_HOPS;

  function withHops(hops: string | undefined) {
    if (hops === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = hops;
  }

  afterEach(() => {
    withHops(originalHops);
  });

  it('XFF forjado não muda o IP gravado: vale o que o Traefik acrescentou', () => {
    withHops(undefined);
    for (const forged of ['1.1.1.1', '10.0.0.1, ::1', 'lixo, ,']) {
      expect(clientIpForAudit(request(`${forged}, ${CLIENT_IP}`))).toBe(CLIENT_IP);
    }
  });

  it('segue TRUSTED_PROXY_HOPS, como o limite por IP', () => {
    withHops('2');
    expect(clientIpForAudit(request(`6.6.6.6, ${CLIENT_IP}, 172.70.1.1`))).toBe(CLIENT_IP);
    withHops('0');
    expect(clientIpForAudit(request(`6.6.6.6, ${CLIENT_IP}`))).toBe(SOCKET_IP);
    withHops('dois');
    expect(clientIpForAudit(request(`6.6.6.6, ${CLIENT_IP}`))).toBe(CLIENT_IP);
  });

  it('sem XFF grava o socket (API sem proxy na frente)', () => {
    withHops(undefined);
    expect(clientIpForAudit(request(undefined))).toBe(SOCKET_IP);
  });

  it('sem endereço nenhum grava NULL, não "unknown"', () => {
    withHops(undefined);
    expect(clientIpForAudit({ headers: {} })).toBeUndefined();
  });

  it('IP maior que a coluna (45) grava NULL em vez de derrubar a gravação', () => {
    withHops(undefined);
    const longIpv6 = 'fe80:0000:0000:0000:0000:0000:0000:0001%interface0';
    expect(clientIpForAudit(request(undefined, longIpv6))).toBeUndefined();
    const longest = 'ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255';
    expect(longest).toHaveLength(45);
    expect(clientIpForAudit(request(longest))).toBe(longest);
  });
});
