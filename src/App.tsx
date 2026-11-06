import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { parsePreset } from './data/preset'
import type { Preset } from './data/preset'
import { forgetSavedPreset, readSavedPreset, savePreset } from './data/preset-storage'
import { buildProductionChain } from './graph/production'
import { ItemIcon } from './ItemIcon'
import './App.css'

// The graph (React Flow and the ELK worker) loads on first use, keeping the initial bundle small.
const ProductionGraph = lazy(() => import('./graph/ProductionGraph').then(
  module => ({ default: module.ProductionGraph }),
  (failure: unknown) => ({
    default: () => <p role="alert">The graph could not be loaded: {failure instanceof Error ? failure.message : String(failure)} Reload the page to try again.</p>,
  }),
))

function App() {
  const [preset, setPreset] = useState<Preset>()
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('Restoring saved preset...')
  const [filename, setFilename] = useState('')
  const [remembered, setRemembered] = useState(false)
  const [canForget, setCanForget] = useState(false)
  const [storageWarning, setStorageWarning] = useState('')
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(() => new Set())
  const [inspected, setInspected] = useState('')
  const requests = useRef({ importing: 0, active: 0 })
  useEffect(() => {
    const state = requests.current
    const request = ++state.importing
    void readSavedPreset().then(saved => {
      if (request !== state.importing) return
      if (saved) {
        state.active = request
        setPreset(saved.preset)
        setFilename(saved.filename)
        setRemembered(true)
        setCanForget(true)
      }
      setLoading('')
    }, failure => {
      if (request !== state.importing) return
      setCanForget(true)
      setStorageWarning(`Saved preset could not be restored: ${failure instanceof Error ? failure.message : String(failure)} Import a file to continue, or forget the saved preset.`)
      setLoading('')
    })
    return () => {
      ++state.importing
      state.active = 0
    }
  }, [])
  const result = useMemo(() => {
    if (!preset || !selected) return undefined
    try {
      return { chain: buildProductionChain(preset, selected, choices, expandedBranches) }
    } catch (failure) {
      return { error: failure instanceof Error ? failure.message : String(failure) }
    }
  }, [preset, selected, choices, expandedBranches])
  const materials = useMemo(() => new Map(preset?.materials.map(material => [material.id, material])), [preset])

  async function importPreset(file: File) {
    const request = ++requests.current.importing
    setError('')
    setLoading('Importing preset...')
    try {
      const imported = parsePreset(JSON.parse(await file.text()))
      if (request !== requests.current.importing) return
      requests.current.active = request
      setPreset(imported)
      setSelected('')
      setInspected('')
      setQuery('')
      setChoices({})
      setExpandedBranches(new Set())
      setFilename(file.name || 'Unnamed preset')
      setRemembered(false)
      setStorageWarning('')
      setLoading('Saving preset on this browser...')
      try {
        await savePreset({ filename: file.name || 'Unnamed preset', preset: imported })
        if (request !== requests.current.active) return
        setRemembered(true)
        setCanForget(true)
      } catch (failure) {
        if (request !== requests.current.active) return
        setCanForget(true)
        setStorageWarning(`Preset loaded, but could not be remembered: ${failure instanceof Error ? failure.message : String(failure)} This import is usable until reload. An older saved preset may still be restored instead.`)
      }
    } catch (failure) {
      if (request === requests.current.importing) {
        setError(`Preset import failed: ${failure instanceof Error ? failure.message : String(failure)}`)
      }
    } finally {
      if (request === requests.current.importing) setLoading('')
    }
  }

  async function forgetPreset() {
    const request = ++requests.current.importing
    setLoading('Forgetting saved preset...')
    try {
      await forgetSavedPreset()
      if (request !== requests.current.importing) return
      setRemembered(false)
      setCanForget(false)
      setStorageWarning('')
    } catch (failure) {
      if (request !== requests.current.importing) return
      setStorageWarning(`Saved preset could not be forgotten: ${failure instanceof Error ? failure.message : String(failure)} The saved copy may still be restored after reload.`)
    } finally {
      if (request === requests.current.importing) setLoading('')
    }
  }
  const recipes = preset?.recipes.filter(recipe => !recipe.hidden &&
    `${recipe.displayName} ${recipe.id}`.toLowerCase().includes(query.toLowerCase())) ?? []
  const details = inspected.startsWith('recipe:')
    ? preset?.recipes.find(recipe => `recipe:${recipe.id}` === inspected)
    : undefined
  const materialName = (id: string) => materials.get(id)?.displayName ?? id

  return (
    <main className="app">
      <header>
        <p className="eyebrow">Factorio / Production chains</p>
        <h1>Factorio Recipe Visualizer</h1>
        <p>Follow ingredients from raw resources to finished products. No ratios or machine counts.</p>
        <section className="import-area" aria-label="Preset import" onDragOver={event => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }} onDrop={event => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          if (loading === 'Forgetting saved preset...') {
            setError('Please wait until forgetting finishes before importing a preset.')
            return
          }
          if (event.dataTransfer.files.length !== 1) {
            setError('Drop exactly one preset JSON file.')
            return
          }
          void importPreset(event.dataTransfer.files[0])
        }}>
          <label className="import">
            Import preset (.json)
            <input type="file" accept=".json,application/json" disabled={loading === 'Forgetting saved preset...'} onChange={event => {
              const file = event.target.files?.[0]
              if (file) void importPreset(file)
              event.target.value = ''
            }} />
          </label>
          <p>Or drag one <code>preset.json</code> file from Finder into this area.</p>
          <p className="import-help">On macOS, press <kbd>Cmd+Shift+.</kbd> in the file picker to show hidden folders such as <code>.factorio-export</code>.
            {' '}Press <kbd>Cmd+Shift+G</kbd> to paste the export folder's absolute path.
            {' '}The export command also prints a command to reveal the preset in Finder.</p>
        </section>
        {loading && <p role="status">{loading}</p>}
        {filename && <p className="saved-preset" role="status">
          {filename} / {remembered ? 'Remembered on this browser.' : 'Not remembered on this browser; usable until reload.'}
        </p>}
        {canForget && <button disabled={Boolean(loading)} onClick={() => { void forgetPreset() }}>Forget saved preset</button>}
        {storageWarning && <p role="alert">{storageWarning}</p>}
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
                      setExpandedBranches(new Set())
                      setInspected(`recipe:${recipe.id}`)
                    }}>
                      <ItemIcon src={recipe.icon} />{recipe.displayName}<small>{recipe.id}</small>
                    </button>
                  </li>
                ))}
              </ul>
              {!recipes.length && <p>No matching recipes.</p>}
            </aside>
            <section className="chain">
              <h2>{preset.recipes.find(recipe => recipe.id === selected)?.displayName ?? 'Select a recipe'}</h2>
              <p className="legend">Flow: inputs → recipes → products. Green: raw resource. Amber: producer choice. Red: unresolved input. Expand branches as needed.</p>
              {result?.error && <p role="alert">{result.error}</p>}
              {result?.chain && (
                <Suspense fallback={<p role="status">Loading graph...</p>}>
                  <ProductionGraph chain={result.chain} onInspect={setInspected} />
                </Suspense>
              )}
              {result?.chain?.branches.length ? (
                <section className="branch-controls" aria-label="Branch controls">
                  <h3>Branch controls</h3>
                  {result.chain.branches.map(branch => {
                    const expanded = expandedBranches.has(branch.material)
                    const needsChoice = result.chain.choices.some(choice => choice.material === branch.material)
                    const selectedProducer = choices[branch.material]
                    return (
                      <button
                        key={branch.material}
                        aria-pressed={expanded}
                        disabled={needsChoice && !selectedProducer}
                        onClick={() => {
                          setExpandedBranches(previous => {
                            const next = new Set(previous)
                            if (next.has(branch.material)) next.delete(branch.material)
                            else next.add(branch.material)
                            return next
                          })
                        }}
                      >
                        {expanded ? 'Collapse' : 'Expand'} {branch.label} branch
                      </button>
                    )
                  })}
                </section>
              ) : null}
              {result?.chain?.choices.map(choice => (
                <label className="producer-choice" key={choice.material}>
                  Producer for {materialName(choice.material)}
                  <select value={choices[choice.material] ?? ''} onChange={event => {
                    const value = event.target.value
                    setChoices(previous => ({ ...previous, [choice.material]: value }))
                    setExpandedBranches(previous => {
                      const next = new Set(previous)
                      if (value) next.add(choice.material)
                      else next.delete(choice.material)
                      return next
                    })
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
                  <h3><ItemIcon src={details.icon} />{details.displayName}</h3>
                  <p>Category: {details.categories.join(', ')}</p>
                  <p>Ingredients: {details.ingredients.map(entry => {
                    const constraints = [
                      entry.temperature !== undefined ? `at ${entry.temperature}°C` : '',
                      entry.minimumTemperature !== undefined ? `minimum ${entry.minimumTemperature}°C` : '',
                      entry.maximumTemperature !== undefined ? `maximum ${entry.maximumTemperature}°C` : '',
                    ].filter(Boolean)
                    return `${materialName(entry.material)}${constraints.length ? ` (${constraints.join(', ')})` : ''}`
                  }).join(', ') || 'None'}</p>
                  <p>Products: {details.products.map(entry => {
                    const node = result?.chain?.nodes.find(candidate => candidate.id === entry.material)
                    const qualifiers = [
                      entry.amountMin !== undefined && entry.amountMax !== undefined && entry.amountMin !== entry.amountMax ? 'variable output' : '',
                      entry.probability !== undefined && entry.probability < 1 ? 'probabilistic output' : '',
                      node?.kind === 'byproduct' ? 'byproduct' : '',
                    ].filter(Boolean)
                    return `${materialName(entry.material)}${qualifiers.length ? ` (${qualifiers.join(', ')})` : ''}`
                  }).join(', ')}</p>
                  <div className="material-icons" aria-label="Ingredient and product icons">
                    {[...new Set([...details.ingredients, ...details.products].map(entry => entry.material))].map(id => (
                      <span key={id}><ItemIcon src={materials.get(id)?.icon} />{materialName(id)}</span>
                    ))}
                  </div>
                </section>
              )}
              {inspected && !details && <p><ItemIcon src={materials.get(inspected)?.icon} />Material: {materialName(inspected)}</p>}
            </section>
          </div>
          {preset.warnings.length > 0 && <details><summary>Import warnings and unsupported features ({preset.warnings.length})</summary><ul>{preset.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        </>
      )}
    </main>
  )
}

export default App
