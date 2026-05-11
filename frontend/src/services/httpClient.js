import { appConfig } from '../config/appConfig'

export async function httpGet(path) {
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`)

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return response.json()
}
