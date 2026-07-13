import type { Tenant } from "./types";

export const tenants: Tenant[] = [
  { id: "t1", nome: "Studio Vitta Pilates", plano: "Premium", status: "ativo", conversasNoMes: 412, limiteConversas: 1000 },
  { id: "t2", nome: "Advocacia Reis & Sales", plano: "Premium", status: "ativo", conversasNoMes: 897, limiteConversas: 1000 },
  { id: "t3", nome: "Clínica OdontoPrime", plano: "Básico", status: "ativo", conversasNoMes: 210, limiteConversas: 300 },
  { id: "t4", nome: "Auto Center Andrade", plano: "Básico", status: "pausado", conversasNoMes: 45, limiteConversas: 300 },
  { id: "t5", nome: "Espaço Beleza & Cia", plano: "Premium", status: "ativo", conversasNoMes: 631, limiteConversas: 1000 },
  { id: "t6", nome: "Prefeitura de Itaoca — Protocolo", plano: "Setor Público", status: "ativo", conversasNoMes: 1204, limiteConversas: 2000 },
  { id: "t7", nome: "Consultório Dra. Ferraz", plano: "Básico", status: "cancelado", conversasNoMes: 0, limiteConversas: 300 },
];
