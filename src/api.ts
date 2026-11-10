export type Container = {
  id: string
  name: string
  image: string[]
  status: string
  ports?: { container_port: number; host_port: number; protocol: string; host_ip: string }[]
}

export type Image = {
  id: string
  tags: string[]
  size: number
}

export type Volume = {
  name: string
  driver: string
  mountpoint: string
}

export type Network = {
  id: string
  name: string
  driver: string
  subnet: string | null
  gateway: string | null
  containers: NetworkContainer[]
}

export type NetworkContainer = {
  id: string
  name: string
  status: string
  ipv4_address: string | null
  aliases: string[]
}

export type DockerData = {
  containers: Container[]
  images: Image[]
  volumes: Volume[]
  networks: Network[]
  host_addresses: string[]
  health: { api: string; docker: string; docker_version?: string }
}

export type MachineInfo = {
  hostname: string
  system: string
  release: string
  version: string
  architecture: string
  processor: string
  cpu_count: number
  cpu_logical_count: number
  cpu_percent: number
  memory: { total_bytes: number; available_bytes: number; used_bytes: number; used_percent: number }
  disks: { device: string; mountpoint: string; filesystem: string; total_bytes: number; used_bytes: number; free_bytes: number; used_percent: number }[]
  ip_addresses: string[]
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new Error('Não foi possível conectar à API. Verifique se o backend está em execução.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    throw new Error(typeof detail === 'string' ? detail : `A solicitação falhou (${response.status}).`)
  }
  return response.json() as Promise<T>
}

export async function loadDockerData(): Promise<DockerData> {
  const [containers, images, volumes, networks, host, health] = await Promise.all([
    request<Container[]>('/api/containers/?all=true'),
    request<Image[]>('/api/images/'),
    request<Volume[]>('/api/volumes/'),
    request<Network[]>('/api/networks/'),
    request<{ addresses: string[] }>('/api/networks/host-addresses'),
    request<DockerData['health']>('/health'),
  ])
  return { containers, images, volumes, networks, host_addresses: host.addresses, health }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`
}