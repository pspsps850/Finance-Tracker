import { useCallback, useEffect, useState } from 'react'

export function useResource(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [version, setVersion] = useState(0)

  const reload = useCallback(() => setVersion((value) => value + 1), [])

  useEffect(() => {
    let alive = true
    setState((current) => ({ ...current, loading: true, error: null }))
    Promise.resolve()
      .then(loader)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }))
    return () => {
      alive = false
    }
    // The loader intentionally stays out of the dependency list; callers pass
    // the values that should trigger a refetch through `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  return { ...state, reload }
}
