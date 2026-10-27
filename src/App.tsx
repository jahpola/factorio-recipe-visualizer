import { useMemo, useRef, useState } from 'react'
import { parsePreset } from './data/preset'
import type { Preset } from './data/preset'
import { buildProductionChain } from './graph/production'
import { ProductionGraph } from './graph/ProductionGraph'
import './App.css'

function App() {
  const [preset, setPreset] = useState<Preset>()
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [inspected, setInspected] = useState('')
  const importRequest = useRef(0)
  const result = useMemo(() => {
    if (!preset || !selected) return undefined
    try {
      return { chain: buildProductionChain(preset, selected, choices) }
    } catch (failure) {
      return { error: failure instanceof Error ? failure.message : String(failure) }
    }
  }, [preset, selected, choices])

  async function importPreset(file: File) {
    const request = ++importRequest.current
    setError('')
    setLoading(true)
    try {
      const imported = parsePreset(JSON.parse(await file.text()))
      if (request !== importRequest.current) return
      setPreset(imported)
      setSelected('')
      setInspected('')
      setQuery('')
      setChoices({})
    } catch (failure) {
      if (request === importRequest.current) {
        setError(`Preset import failed: ${failure instanceof Error ? failure.message : String(failure)}`)
      }
    } finally {
      if (request === importRequest.current) setLoading(false)
    }
  }
  const recipes = preset?.recipes.filter(recipe => !recipe.hidden &&
    `${recipe.displayName} ${recipe.id}`.toLowerCase().includes(query.toLowerCase())) ?? []
  const details = inspected.startsWith('recipe:')
    ? preset?.recipes.find(recipe => `recipe:${recipe.id}` === inspected)
    : undefined
  const materialName = (id: string) => preset?.materials.find(material => material.id === id)?.displayName ?? id

  return (
    <main className="app">
      <header>
        <p className="eyebrow">Factorio / Production chains</p>
        <h1>Factorio Recipe Visualizer</h1>
        <p>Follow ingredients from raw resources to finished products. No ratios or machine counts.</p>
        <label className="import">
          Import preset (.json)
          <input type="file" accept=".json,application/json" onChange={event => {
            const file = event.target.files?.[0]
            if (file) void importPreset(file)
            event.target.value = ''
          }} />
        </label>
        {loading && <p role="status">Importing preset...</p>}
        {error && <p role="alert">{error} The previous preset, if any, is unchanged.</p>}
      </header>
      {!preset ? (
        <section className="empty">
          <h2>Start with your game recipes</h2>
          <p>Run <code>pnpm export:factorio</code>, then import the generated <code>preset.json</code>.</p>
          <p>For the first example, search for Electronic circuit (green circuit).</p>
        </section>
      ) : (
        <>
          <p className="preset-info">
            Factorio {preset.gameVersion} / {preset.mods.map(mod => `${mod.name} ${mod.version}`).join(', ')} / {preset.language}
          </p>
          <div className="workspace">
            <aside className="browser">
              <h2>Recipes</h2>
              <label htmlFor="recipe-search">Search recipes</label>
              <input id="recipe-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Electronic circuit" />
              <p>{recipes.length} recipes</p>
              <ul className="recipe-list" aria-label="Recipes">
                {recipes.map(recipe => (
                  <li key={recipe.id}>
                    <button aria-pressed={selected === recipe.id} onClick={() => {
                      setSelected(recipe.id)
                      setChoices({})
                      setInspected(`recipe:${recipe.id}`)
                    }}>
                      {recipe.displayName}<small>{recipe.id}</small>
                    </button>
                  </li>
                ))}
              </ul>
              {!recipes.length && <p>No matching recipes.</p>}
            </aside>
            <section className="chain">
              <h2>{preset.recipes.find(recipe => recipe.id === selected)?.displayName ?? 'Select a recipe'}</h2>
              <p className="legend">Flow: inputs → recipes → products. Green: raw resource. Amber: producer choice. Red: unresolved input.</p>
              {result?.error && <p role="alert">{result.error}</p>}
              {result?.chain && <ProductionGraph chain={result.chain} onInspect={setInspected} />}
              {result?.chain?.choices.map(choice => (
                <label className="producer-choice" key={choice.material}>
                  Producer for {materialName(choice.material)}
                  <select value={choices[choice.material] ?? ''} onChange={event => {
                    const value = event.target.value
                    setChoices(previous => ({ ...previous, [choice.material]: value }))
                  }}>
                    <option value="">Choose a recipe</option>
                    {choice.recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.displayName} ({recipe.id})</option>)}
                  </select>
                </label>
              ))}
              {result?.chain && (
                <details className="chain-summary">
                  <summary>Accessible chain summary ({result.chain.nodes.length} nodes)</summary>
                  <ul>{result.chain.nodes.map(node => <li key={node.id}>{node.label} — {node.kind}</li>)}</ul>
                </details>
              )}
              {result?.chain?.warnings.map(warning => <p role="status" key={warning}>{warning}</p>)}
              {details && (
                <section className="recipe-details" aria-label="Recipe details">
                  <h3>{details.displayName}</h3>
                  <p>Category: {details.categories.join(', ')}</p>
                  <p>Ingredients: {details.ingredients.map(entry => materialName(entry.material)).join(', ') || 'None'}</p>
                  <p>Products: {details.products.map(entry => materialName(entry.material)).join(', ')}</p>
                </section>
              )}
              {inspected && !details && <p>Material: {materialName(inspected)}</p>}
            </section>
          </div>
          {preset.warnings.length > 0 && <details><summary>Import notes ({preset.warnings.length})</summary><ul>{preset.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        </>
      )}
    </main>
  )
}

export default App
