import { describe, it, expect } from "vitest";
import { clientIdentifier } from "@/lib/whatsapp-gateway/client-identifier";

function reqWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://iris.example.com/api/webhooks/whatsapp/evolution", { headers });
}

describe("clientIdentifier — regressão do achado ALTO-1 (review de segurança, gate fase 9)", () => {
  it("critério: prioriza x-vercel-forwarded-for (injetado pela plataforma, não spoofável pelo cliente)", () => {
    const req = reqWithHeaders({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "1.2.3.4",
      "x-real-ip": "9.9.9.9",
    });
    expect(clientIdentifier(req)).toBe("203.0.113.9");
  });

  it("critério: sem x-vercel-forwarded-for, usa x-real-ip", () => {
    const req = reqWithHeaders({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4" });
    expect(clientIdentifier(req)).toBe("198.51.100.7");
  });

  it("critério: sem x-vercel-forwarded-for/x-real-ip, usa o hop MAIS À DIREITA de x-forwarded-for (o mais próximo do proxy real)", () => {
    const req = reqWithHeaders({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 203.0.113.55" });
    expect(clientIdentifier(req)).toBe("203.0.113.55");
  });

  it("edge case: sem nenhum header, retorna 'unknown'", () => {
    expect(clientIdentifier(reqWithHeaders({}))).toBe("unknown");
  });

  it("REGRESSÃO ALTO-1: rotacionar o hop mais à esquerda de x-forwarded-for (client-controlled) NÃO muda o identifier — o bypass do rate limit por spoofing não funciona mais", () => {
    const trustedTail = "10.0.0.1, 203.0.113.55"; // hops adicionados pelo proxy real, fixos
    const attempt1 = reqWithHeaders({ "x-forwarded-for": `1.1.1.1, ${trustedTail}` });
    const attempt2 = reqWithHeaders({ "x-forwarded-for": `2.2.2.2, ${trustedTail}` });
    const attempt3 = reqWithHeaders({ "x-forwarded-for": `${crypto.randomUUID()}, ${trustedTail}` });

    const id1 = clientIdentifier(attempt1);
    const id2 = clientIdentifier(attempt2);
    const id3 = clientIdentifier(attempt3);

    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
    expect(id1).toBe("203.0.113.55");
  });
});
