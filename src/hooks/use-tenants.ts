"use client";

import { useMemo, useState } from "react";
import { tenants as mockTenants } from "@/mocks/tenants";
import type { Tenant } from "@/mocks/types";

export type TenantScreenState = "loading" | "empty" | "error" | "content";

interface UseTenantsReturn {
  state: TenantScreenState;
  setState: (s: TenantScreenState) => void;
  tenants: Tenant[];
  filtered: Tenant[];
  search: string;
  setSearch: (v: string) => void;
  planoFilter: string;
  setPlanoFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  errorMessage: string;
}

export function useTenants(): UseTenantsReturn {
  const [state, setState] = useState<TenantScreenState>("content");
  const [search, setSearch] = useState("");
  const [planoFilter, setPlanoFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return mockTenants.filter((t) => {
      const matchSearch = t.nome.toLowerCase().includes(search.toLowerCase());
      const matchPlano = planoFilter === "all" || t.plano === planoFilter;
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      return matchSearch && matchPlano && matchStatus;
    });
  }, [search, planoFilter, statusFilter]);

  return {
    state,
    setState,
    tenants: mockTenants,
    filtered,
    search,
    setSearch,
    planoFilter,
    setPlanoFilter,
    statusFilter,
    setStatusFilter,
    errorMessage: "Erro ao carregar tenants. Verifique sua conexão.",
  };
}