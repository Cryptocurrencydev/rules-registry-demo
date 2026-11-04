import { getState, listRules, recentSubmissions } from "@/lib/engine";
import { Picker } from "./picker";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [initial, rules, recent] = await Promise.all([getState({}), listRules(), recentSubmissions()]);

  return (
    <>
      <main>
        <header className="intro">
          <p className="eyebrow">Rules Registry demo</p>
          <h1>Build a sentence. The database decides what you can pick.</h1>
          <p className="lede">
            Every question, option, condition and the sentence order live in Postgres. The page only shows what the engine
            returns, and the server refuses anything else.
          </p>
        </header>

        <Picker initial={initial} recent={recent} />

        <section aria-labelledby="rules-h" className="card">
          <h2 id="rules-h">Rules in the database</h2>
          <p className="muted">Read live from the <code>option_conditions</code> table.</p>
          <table className="rules">
            <thead>
              <tr>
                <th scope="col">Option</th>
                <th scope="col">Only appears when</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.variable + r.option + r.requires}>
                  <td>
                    {r.option} <span className="key">({r.variable})</span>
                  </td>
                  <td>{r.requires}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
      <footer>
        Demo by <a href="https://dctechltd.com">DC Tech</a> · synthetic data, no real content ·{" "}
        <a href="https://github.com/Cryptocurrencydev/rules-registry-demo">source</a>
      </footer>
    </>
  );
}
