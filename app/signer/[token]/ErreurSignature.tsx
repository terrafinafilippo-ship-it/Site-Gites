// Écran d'erreur de la page de signature : lien invalide (404), contrat déjà
// signé (409), lien expiré (410). Présentationnel pur, mise en forme sobre.

export function ErreurSignature({
  code,
  titre,
  message,
}: {
  code: 404 | 409 | 410;
  titre: string;
  message: string;
}) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <div className="border rounded p-6 bg-white">
        <p className="text-sm uppercase tracking-wide">Les Gîtes de Samoyas</p>
        <h1 className="text-2xl font-semibold mt-2 mb-3">{titre}</h1>
        <p className="leading-relaxed">{message}</p>
        <p className="text-sm mt-4">Code : {code}</p>
      </div>
    </main>
  );
}
