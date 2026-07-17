import { useState } from 'react'

interface AddProfileProps {
  run(action: () => Promise<void>): Promise<void>
}

export function AddProfile({ run }: AddProfileProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('Codex')
  const [codexHome, setCodexHome] = useState('')

  const chooseHome = async (): Promise<void> => {
    const selected = await window.resetNet.chooseCodexHome()
    if (selected) setCodexHome(selected)
  }

  const add = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    await run(() => window.resetNet.addProfile({ name, codexHome }))
    setName('Codex')
    setCodexHome('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button type="button" className="add-profile-button" onClick={() => setOpen(true)}>
        + Track another Codex home
      </button>
    )
  }

  return (
    <form className="add-profile-form" onSubmit={(event) => void add(event)}>
      <label>
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.currentTarget.value)} required />
      </label>
      <label>
        <span>CODEX_HOME</span>
        <div className="path-input-row">
          <input
            value={codexHome}
            onChange={(event) => setCodexHome(event.currentTarget.value)}
            placeholder="/Users/you/.codex"
            required
          />
          <button type="button" onClick={() => void chooseHome()}>
            Browse
          </button>
        </div>
      </label>
      <div className="form-actions">
        <button type="button" className="text-button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="primary-button">
          Add home
        </button>
      </div>
    </form>
  )
}
