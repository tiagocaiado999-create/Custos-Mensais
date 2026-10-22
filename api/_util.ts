// Ajudas comuns às funções (o `_` impede que seja uma rota).

// Texto de um erro apanhado num catch (que em TypeScript é `unknown`)
export function msg(e: unknown): string {
  return String((e as { message?: string } | null)?.message || e);
}

// Um parâmetro do URL pode vir repetido (?id=a&id=b); fica só o primeiro, ou '' se não existir
export function um(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] || '') : (v || '');
}
