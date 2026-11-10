import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Boxes,
  Box,
  Check,
  ChevronDown,
  CircleAlert,
  Container as ContainerIcon,
  Database,
  HardDrive,
  Image as ImageIcon,
  LoaderCircle,
  Menu,
  Network as NetworkIcon,
  Plus,
  RefreshCw,
  Search,
  Server,
  TerminalSquare,
  Trash2,
  X,
  Play,
  Square,
  RotateCw,
  Download,
  ExternalLink,
  Copy,
  Link as LinkIcon,
  Unlink,
} from 'lucide-react'
import { formatBytes, loadDockerData, request, type Container, type DockerData, type Image, type Network, type Volume } from './api'

type Section = 'overview' | 'containers' | 'images' | 'volumes' | 'networks'
type DialogKind = 'container' | 'image' | 'volume' | 'network' | 'network-members' | 'logs' | 'shell'
type DialogState = { kind: DialogKind; title?: string; target?: string }

const emptyData: DockerData = {
  containers: [], images: [], volumes: [], networks: [], host_addresses: [],
  health: { api: 'offline', docker: 'offline' },
}

const navigation: { id: Section; label: string; icon: typeof Boxes }[] = [
  { id: 'overview', label: 'Visão geral', icon: Activity },
  { id: 'containers', label: 'Containers', icon: ContainerIcon },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'volumes', label: 'Volumes', icon: HardDrive },
  { id: 'networks', label: 'Redes', icon: NetworkIcon },
]

const sectionTitles: Record<Section, string> = {
  overview: 'Visão geral', containers: 'Containers', images: 'Images', volumes: 'Volumes', networks: 'Redes',
}

function displayImage(images: string[] | undefined) {
  return images?.length ? images.join(', ') : 'imagem sem tag'
}

function StatusBadge({ status }: { status: string }) {
  const running = status.toLowerCase() === 'running'
  return <span className={`status-badge ${running ? 'is-running' : 'is-stopped'}`}><i />{running ? 'Em execução' : status || 'Desconhecido'}</span>
}

function IconButton({ label, onClick, children, danger = false, disabled = false }: {
  label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean
}) {
  return <button className={`icon-button ${danger ? 'danger' : ''}`} type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>
}

function App() {
  const [data, setData] = useState<DockerData>(emptyData)
  const [section, setSection] = useState<Section>('overview')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [logs, setLogs] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      setData(await loadDockerData())
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os recursos Docker.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function perform(action: () => Promise<unknown>, message: string): Promise<boolean> {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(message)
      await refresh()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'A operação não foi concluída.')
      return false
    } finally {
      setBusy(false)
    }
  }

  function removeResource(path: string, label: string) {
    if (!window.confirm(`Remover ${label}? Esta ação não pode ser desfeita.`)) return
    void perform(() => request(path, { method: 'DELETE' }), `${label} removido.`)
  }

  async function showLogs(container: Container) {
    setDialog({ kind: 'logs', title: container.name, target: container.id })
    setLogs('')
    setLogsLoading(true)
    try {
      const result = await request<{ logs: string }>(`/api/containers/${encodeURIComponent(container.id)}/logs?tail=100`)
      setLogs(result.logs || 'Nenhum log disponível.')
    } catch (reason) {
      setLogs(reason instanceof Error ? reason.message : 'Não foi possível carregar os logs.')
    } finally {
      setLogsLoading(false)
    }
  }

  async function submitDialog(values: Record<string, FormDataEntryValue>) {
    if (!dialog) return
    const name = String(values.name || '').trim()
    let path = ''
    let body: Record<string, unknown> = {}
    let success = ''
    if (dialog.kind === 'container') {
      const ports: Record<string, number> = {}
      const mappings = JSON.parse(String(values.portMappings || '[]')) as { host: string; container: string }[]
      for (const mapping of mappings) {
        if (!mapping.host && !mapping.container) continue
        const hostPort = Number(mapping.host)
        const containerPort = Number(mapping.container)
        if (!mapping.host || !mapping.container || !Number.isInteger(hostPort) || !Number.isInteger(containerPort) || hostPort < 1 || hostPort > 65535 || containerPort < 1 || containerPort > 65535) {
          setError('Preencha as duas portas com valores entre 1 e 65535.')
          return
        }
        const containerPortKey = `${containerPort}/tcp`
        if (ports[containerPortKey] !== undefined) {
          setError(`A porta ${containerPort} do container foi informada mais de uma vez.`)
          return
        }
        ports[containerPortKey] = hostPort
      }
      let volume: { kind: 'volume' | 'bind'; source: string; target: string; read_only: boolean; copy_initial_data?: boolean } | null = null
      if (values.persistData === 'on') {
        const volumeTarget = String(values.volumeTarget || '').trim()
        if (!volumeTarget.startsWith('/')) {
          setError('Informe uma pasta válida dentro do container, começando com /.')
          return
        }
        const volumeKind = String(values.volumeKind || 'volume')
        if (volumeKind === 'bind') {
          const hostPath = String(values.hostPath || '').trim()
          if (!hostPath) {
            setError('Informe a pasta do computador que deseja compartilhar.')
            return
          }
          volume = { kind: 'bind', source: hostPath, target: volumeTarget, read_only: false, copy_initial_data: values.copyInitialData === 'on' }
        } else {
          const selectedVolume = String(values.volumeName || '__new__')
          const volumeName = selectedVolume === '__new__'
            ? `${name.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-')}-data`
            : selectedVolume
          volume = { kind: 'volume', source: volumeName, target: volumeTarget, read_only: false }
        }
      }
      path = '/api/containers/'
      body = {
        name,
        image: String(values.image || '').trim(),
        ports: Object.keys(ports).length ? ports : null,
        volume,
        detach: true,
        restart_policy: String(values.restart_policy || 'no'),
      }
      success = 'Container criado.'
    } else if (dialog.kind === 'image') {
      path = '/api/images/pull'
      body = { name: String(values.name || '').trim() }
      success = 'Download da imagem iniciado e concluído.'
    } else if (dialog.kind === 'volume') {
      path = '/api/volumes/'
      body = { name, driver: String(values.driver || 'local') }
      success = 'Volume criado.'
    } else if (dialog.kind === 'network') {
      path = '/api/networks/'
      body = { name, driver: String(values.driver || 'bridge') }
      success = 'Rede criada.'
    }
    const completed = await perform(() => request(path, { method: 'POST', body: JSON.stringify(body) }), success)
    if (completed) setDialog(null)
  }

  const filteredContainers = useMemo(() => data.containers.filter((item) => `${item.name} ${item.id} ${displayImage(item.image)} ${item.status}`.toLowerCase().includes(query.toLowerCase())), [data.containers, query])
  const filteredImages = useMemo(() => data.images.filter((item) => `${item.id} ${item.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [data.images, query])
  const filteredVolumes = useMemo(() => data.volumes.filter((item) => `${item.name} ${item.driver} ${item.mountpoint}`.toLowerCase().includes(query.toLowerCase())), [data.volumes, query])
  const filteredNetworks = useMemo(() => data.networks.filter((item) => `${item.name} ${item.id} ${item.driver}`.toLowerCase().includes(query.toLowerCase())), [data.networks, query])

  const dockerOnline = data.health.docker === 'online'
  const runningCount = data.containers.filter((item) => item.status.toLowerCase() === 'running').length
  const sectionAction: Partial<Record<Section, { label: string; icon: typeof Plus; dialog: DialogKind }>> = {
    containers: { label: 'Novo container', icon: Plus, dialog: 'container' },
    images: { label: 'Baixar imagem', icon: Download, dialog: 'image' },
    volumes: { label: 'Novo volume', icon: Plus, dialog: 'volume' },
    networks: { label: 'Nova rede', icon: Plus, dialog: 'network' },
  }
  const action = sectionAction[section]

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <a className="brand" href="#overview" onClick={() => { setSection('overview'); setMobileMenuOpen(false) }}>
          <span className="brand-mark"><Boxes size={21} strokeWidth={2.2} /></span>
          <span className="brand-name">dock<span>desk</span></span>
          <span className="brand-edition">LOCAL</span>
        </a>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="main-nav" aria-label="Navegação principal">
          {navigation.map(({ id, label, icon: Icon }) => {
            const count = id === 'containers' ? data.containers.length : id === 'images' ? data.images.length : id === 'volumes' ? data.volumes.length : id === 'networks' ? data.networks.length : null
            return <button className={`nav-item ${section === id ? 'active' : ''}`} key={id} onClick={() => { setSection(id); setQuery(''); setMobileMenuOpen(false) }}>
              <Icon size={18} strokeWidth={1.9} /><span>{label}</span>{count !== null && <span className="nav-count">{count}</span>}
            </button>
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className={`engine-card ${dockerOnline ? 'online' : 'offline'}`}>
            <span className="engine-icon"><Server size={16} /></span>
            <div className="engine-copy"><strong>Docker Engine</strong><span>{dockerOnline ? `Conectado · v${data.health.docker_version || 'local'}` : loading ? 'Verificando conexão' : 'Desconectado'}</span></div>
            <span className="engine-dot" />
          </div>
          <div className="sidebar-foot"><span>Docker Desk</span><span>v1.0</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-divider">/</span><strong>{sectionTitles[section]}</strong></div>
          <div className="topbar-actions">
            <span className={`connection-pill ${dockerOnline ? 'online' : 'offline'}`}><i />{dockerOnline ? 'Engine conectado' : 'Engine offline'}</span>
            <button className="refresh-button" onClick={() => void refresh()} disabled={loading} title="Atualizar dados"><RefreshCw size={16} className={loading ? 'spinning' : ''} /><span>Atualizar</span></button>
          </div>
        </header>

        <div className="content-wrap">
          {error && <div className="alert alert-error"><CircleAlert size={18} /><span>{error}</span><button aria-label="Fechar aviso" onClick={() => setError('')}><X size={16} /></button></div>}
          {notice && <div className="alert alert-success"><Check size={18} /><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}

          <div className="page-heading">
            <div><div className="eyebrow">AMBIENTE LOCAL <span className="eyebrow-rule" /></div><h1>{section === 'overview' ? 'Seu ambiente Docker' : sectionTitles[section]}</h1><p>{section === 'overview' ? 'Recursos e atividade do Docker em um só lugar.' : `${sectionTitles[section]} disponíveis neste ambiente.`}</p></div>
            {action && <button className="primary-button" onClick={() => setDialog({ kind: action.dialog })} disabled={busy}><action.icon size={17} />{action.label}</button>}
          </div>

          {section === 'overview' ? <Overview data={data} runningCount={runningCount} loading={loading} onNavigate={setSection} /> : <>
            <div className="table-toolbar">
              <div className="table-count"><span className="count-dot" />{loading ? 'Sincronizando recursos' : `${resourceCount(section, data)} ${pluralResource(section, resourceCount(section, data))}`}</div>
              <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar ${sectionTitles[section].toLowerCase()}...`} /><kbd>⌘ K</kbd></label>
            </div>
            <div className="table-frame">
              {section === 'containers' && <ContainerTable items={filteredContainers} busy={busy} onAction={(item, actionName) => {
                if (actionName === 'shell') { setDialog({ kind: 'shell', title: item.name, target: item.id }); return }
                if (actionName === 'logs') { void showLogs(item); return }
                if (actionName === 'remove') { removeResource(`/api/containers/${encodeURIComponent(item.id)}`, `o container ${item.name}`); return }
                if (actionName === 'open') {
                  const webPort = item.ports?.find((port) => port.protocol === 'tcp' && [80, 443, 3000, 5173, 8000, 8080, 8081].includes(port.container_port))
                  if (webPort) {
                    const host = ['127.0.0.1', '::', '::1', '0.0.0.0'].includes(webPort.host_ip) ? 'localhost' : window.location.hostname
                    const protocol = webPort.container_port === 443 ? 'https' : 'http'
                    window.open(`${protocol}://${host}:${webPort.host_port}`, '_blank', 'noopener,noreferrer')
                  }
                  return
                }
                const endpoint = actionName === 'start' ? 'start' : actionName === 'stop' ? 'stop' : 'restart'
                void perform(() => request(`/api/containers/${encodeURIComponent(item.id)}/${endpoint}`, { method: 'POST' }), `Container ${actionName === 'start' ? 'iniciado' : actionName === 'stop' ? 'parado' : 'reiniciado'}.`)
              }} />}
              {section === 'images' && <ImageTable items={filteredImages} busy={busy} onRemove={(item) => removeResource(`/api/images/${encodeURIComponent(item.id)}`, `a imagem ${displayImage(item.tags)}`)} />}
              {section === 'volumes' && <VolumeTable items={filteredVolumes} busy={busy} onRemove={(item) => removeResource(`/api/volumes/${encodeURIComponent(item.name)}`, `o volume ${item.name}`)} />}
              {section === 'networks' && <NetworkTable items={filteredNetworks} busy={busy} onManage={(item) => setDialog({ kind: 'network-members', title: item.name, target: item.id })} onRemove={(item) => removeResource(`/api/networks/${encodeURIComponent(item.id)}`, `a rede ${item.name}`)} />}
            </div>
            {section === 'networks' && <HostAddressBar addresses={data.host_addresses} onCopy={(address) => {
              void navigator.clipboard.writeText(address).then(() => setNotice(`IP ${address} copiado.`)).catch(() => setError('Não foi possível copiar o endereço IP.'))
            }} />}
          </>}
          <footer className="page-footer"><span><span className="footer-led" />Dados atualizados ao vivo</span><span>API local <b>127.0.0.1:8000</b></span></footer>
        </div>
      </main>

      {dialog && (dialog.kind === 'container' || dialog.kind === 'image' || dialog.kind === 'volume' || dialog.kind === 'network') && <ResourceDialog kind={dialog.kind} images={data.images} volumes={data.volumes} busy={busy} onClose={() => setDialog(null)} onSubmit={submitDialog} />}
      {dialog?.kind === 'logs' && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="modal logs-modal" role="dialog" aria-modal="true" aria-labelledby="logs-title"><div className="modal-head"><div><span className="modal-kicker">SAÍDA DO CONTAINER</span><h2 id="logs-title">{dialog.title}</h2></div><button className="close-button" onClick={() => setDialog(null)} aria-label="Fechar"><X size={19} /></button></div><div className="logs-toolbar"><TerminalSquare size={15} />Últimas 100 linhas <button onClick={() => { const item = data.containers.find((container) => container.id === dialog.target); if (item) void showLogs(item) }}><RefreshCw size={14} />Recarregar</button></div><pre className="logs-output">{logsLoading ? <span className="logs-loading"><LoaderCircle size={16} className="spinning" />Carregando logs...</span> : logs}</pre></section></div>}
      {dialog?.kind === 'shell' && <ContainerShellDialog containerId={dialog.target || ''} title={dialog.title || 'Container'} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'network-members' && <NetworkConnectionsDialog network={data.networks.find((item) => item.id === dialog.target)} containers={data.containers} busy={busy} onClose={() => setDialog(null)} onConnect={(containerId) => perform(() => request(`/api/networks/${encodeURIComponent(dialog.target || '')}/connect`, { method: 'POST', body: JSON.stringify({ container_id: containerId }) }), 'Container conectado à rede.')} onDisconnect={(containerId, containerName) => perform(() => request(`/api/networks/${encodeURIComponent(dialog.target || '')}/containers/${encodeURIComponent(containerId)}`, { method: 'DELETE' }), `Container ${containerName} desconectado da rede.`)} />}
    </div>
  )
}

function resourceCount(section: Section, data: DockerData) {
  return section === 'containers' ? data.containers.length : section === 'images' ? data.images.length : section === 'volumes' ? data.volumes.length : data.networks.length
}

function pluralResource(section: Section, count: number) {
  if (section === 'containers') return count === 1 ? 'container' : 'containers'
  if (section === 'images') return count === 1 ? 'imagem' : 'imagens'
  if (section === 'volumes') return count === 1 ? 'volume' : 'volumes'
  return count === 1 ? 'rede' : 'redes'
}

function Overview({ data, runningCount, loading, onNavigate }: { data: DockerData; runningCount: number; loading: boolean; onNavigate: (section: Section) => void }) {
  const metrics = [
    { label: 'Containers ativos', value: runningCount, total: data.containers.length, icon: ContainerIcon, tone: 'green', section: 'containers' as Section, note: `${data.containers.length - runningCount} parados` },
    { label: 'Images locais', value: data.images.length, icon: ImageIcon, tone: 'blue', section: 'images' as Section, note: 'disponíveis para uso' },
    { label: 'Volumes', value: data.volumes.length, icon: HardDrive, tone: 'amber', section: 'volumes' as Section, note: 'persistência de dados' },
    { label: 'Redes', value: data.networks.length, icon: NetworkIcon, tone: 'coral', section: 'networks' as Section, note: 'interfaces disponíveis' },
  ]
  return <>
    <div className="metrics-grid">{metrics.map(({ label, value, total, icon: Icon, tone, section, note }) => <button className="metric-card" key={label} onClick={() => onNavigate(section)}><span className={`metric-icon ${tone}`}><Icon size={19} /></span><span className="metric-label">{label}</span><span className="metric-value">{loading ? '—' : value}</span><span className="metric-note">{total !== undefined ? `${value} de ${total} em execução` : note}</span><span className={`metric-corner ${tone}`}><ChevronDown size={16} /></span></button>)}</div>
    <div className="overview-lower">
      <section className="overview-section activity-section"><div className="section-title-row"><div><span className="section-eyebrow">RECURSOS</span><h2>Containers recentes</h2></div><button className="text-button" onClick={() => onNavigate('containers')}>Ver todos <span>→</span></button></div>
        {data.containers.length ? <div className="recent-list">{data.containers.slice(0, 5).map((item) => <div className="recent-row" key={item.id}><span className={`recent-symbol ${item.status.toLowerCase() === 'running' ? 'running' : ''}`}><ContainerIcon size={16} /></span><span className="recent-name"><strong>{item.name}</strong><small>{displayImage(item.image)}</small></span><StatusBadge status={item.status} /><span className="recent-id">{item.id.slice(0, 12)}</span></div>)}</div> : <EmptyState label={loading ? 'Buscando containers...' : 'Nenhum container encontrado'} detail={loading ? 'A lista será atualizada em instantes.' : 'Containers criados aparecerão aqui.'} icon={ContainerIcon} />}
      </section>
      <section className="overview-section engine-section"><div className="section-title-row"><div><span className="section-eyebrow">CONECTIVIDADE</span><h2>Engine status</h2></div><span className={`engine-status-tag ${data.health.docker === 'online' ? 'online' : 'offline'}`}><i />{data.health.docker === 'online' ? 'Online' : loading ? 'Verificando' : 'Offline'}</span></div>
        <div className="engine-visual"><div className="engine-orbit orbit-outer" /><div className="engine-orbit orbit-inner" /><span className={`engine-core ${data.health.docker === 'online' ? 'online' : ''}`}><Boxes size={28} /></span><span className="orbit-node node-top" /><span className="orbit-node node-bottom" /></div>
        <div className="engine-details"><div><span>Docker Engine</span><strong>{data.health.docker_version ? `v${data.health.docker_version}` : 'Local'}</strong></div><div><span>API</span><strong>{data.health.api === 'online' ? 'Conectada' : 'Indisponível'}</strong></div></div>
        <div className="engine-footnote"><span className="engine-footnote-dot" />{data.health.docker === 'online' ? 'Conexão estabelecida com o daemon Docker.' : 'Inicie o backend e o serviço Docker para gerenciar recursos.'}</div>
      </section>
    </div>
  </>
}

function EmptyState({ label, detail, icon: Icon }: { label: string; detail: string; icon: typeof Boxes }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={22} /></span><strong>{label}</strong><span>{detail}</span></div>
}

function TableEmpty({ label }: { label: string }) {
  return <tr><td colSpan={6}><div className="table-empty"><Box size={21} /><span>{label}</span></div></td></tr>
}

function ContainerTable({ items, busy, onAction }: { items: Container[]; busy: boolean; onAction: (item: Container, action: 'start' | 'stop' | 'restart' | 'logs' | 'remove' | 'shell' | 'open') => void }) {
  return <table><thead><tr><th>CONTAINER</th><th>IMAGEM</th><th>STATUS</th><th>ID</th><th className="actions-heading">AÇÕES</th></tr></thead><tbody>{items.length ? items.map((item) => {
    const active = item.status.toLowerCase() === 'running'
    const webPort = item.ports?.find((port) => port.protocol === 'tcp' && [80, 443, 3000, 5173, 8000, 8080, 8081].includes(port.container_port))
    return <tr key={item.id}><td><div className="resource-main"><span className="resource-icon container"><ContainerIcon size={16} /></span><strong>{item.name}</strong></div></td><td className="mono-cell">{displayImage(item.image)}</td><td><StatusBadge status={item.status} /></td><td className="id-cell">{item.id}</td><td><div className="row-actions"><IconButton label={active ? 'Parar container' : 'Iniciar container'} onClick={() => onAction(item, active ? 'stop' : 'start')} disabled={busy}>{active ? <Square size={15} /> : <Play size={15} />}</IconButton><IconButton label="Abrir aplicação" onClick={() => onAction(item, 'open')} disabled={busy || !active || !webPort}><ExternalLink size={15} /></IconButton><IconButton label="Abrir shell" onClick={() => onAction(item, 'shell')} disabled={busy || !active}><TerminalSquare size={15} /></IconButton><IconButton label="Reiniciar container" onClick={() => onAction(item, 'restart')} disabled={busy}><RotateCw size={15} /></IconButton><IconButton label="Ver logs" onClick={() => onAction(item, 'logs')}><Activity size={15} /></IconButton><IconButton label="Remover container" onClick={() => onAction(item, 'remove')} danger disabled={busy}><Trash2 size={15} /></IconButton></div></td></tr>
  }) : <TableEmpty label="Nenhum container corresponde à busca." />}</tbody></table>
}

function ImageTable({ items, busy, onRemove }: { items: Image[]; busy: boolean; onRemove: (item: Image) => void }) {
  return <table><thead><tr><th>IMAGEM</th><th>ID</th><th>TAMANHO</th><th className="actions-heading">AÇÕES</th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.id}><td><div className="resource-main"><span className="resource-icon image"><ImageIcon size={16} /></span><strong>{displayImage(item.tags)}</strong></div></td><td className="id-cell">{item.id}</td><td className="mono-cell">{formatBytes(item.size)}</td><td><div className="row-actions"><IconButton label="Remover imagem" onClick={() => onRemove(item)} danger disabled={busy}><Trash2 size={15} /></IconButton></div></td></tr>) : <TableEmpty label="Nenhuma imagem corresponde à busca." />}</tbody></table>
}

function VolumeTable({ items, busy, onRemove }: { items: Volume[]; busy: boolean; onRemove: (item: Volume) => void }) {
  return <table><thead><tr><th>VOLUME</th><th>DRIVER</th><th>PONTO DE MONTAGEM</th><th className="actions-heading">AÇÕES</th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.name}><td><div className="resource-main"><span className="resource-icon volume"><Database size={16} /></span><strong>{item.name}</strong></div></td><td><span className="type-chip">{item.driver}</span></td><td className="path-cell">{item.mountpoint}</td><td><div className="row-actions"><IconButton label="Remover volume" onClick={() => onRemove(item)} danger disabled={busy}><Trash2 size={15} /></IconButton></div></td></tr>) : <TableEmpty label="Nenhum volume corresponde à busca." />}</tbody></table>
}

function NetworkTable({ items, busy, onManage, onRemove }: { items: Network[]; busy: boolean; onManage: (item: Network) => void; onRemove: (item: Network) => void }) {
  return <table><thead><tr><th>REDE</th><th>DRIVER</th><th>SUB-REDE / GATEWAY</th><th>CONTAINERS CONECTADOS</th><th className="actions-heading">AÇÕES</th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.id}>
    <td><div className="resource-main"><span className="resource-icon network"><NetworkIcon size={16} /></span><span className="network-name"><strong>{item.name}</strong><small>{item.id}</small></span></div></td>
    <td><span className="type-chip">{item.driver}</span></td>
    <td className="network-address-cell"><span>Rede {item.subnet || 'não informada'}</span><span>Gateway {item.gateway || 'não informado'}</span></td>
    <td><div className="network-member-list">{item.containers.length ? item.containers.map((container) => <span className="network-member" key={container.id}><strong>{container.name}</strong><code>{container.ipv4_address || 'sem IP'}</code></span>) : <span className="network-no-members">Nenhum container conectado</span>}</div></td>
    <td><div className="row-actions"><IconButton label="Associar containers" onClick={() => onManage(item)} disabled={busy || item.driver === 'host' || item.driver === 'null'}><LinkIcon size={15} /></IconButton><IconButton label="Remover rede" onClick={() => onRemove(item)} danger disabled={busy}><Trash2 size={15} /></IconButton></div></td>
  </tr>) : <TableEmpty label="Nenhuma rede corresponde à busca." />}</tbody></table>
}

function HostAddressBar({ addresses, onCopy }: { addresses: string[]; onCopy: (address: string) => void }) {
  return <section className="host-address-bar"><span className="host-address-title"><Server size={16} />IP desta máquina</span>{addresses.length ? <div className="host-address-list">{addresses.map((address) => <span className="host-address" key={address}><code>{address}</code><IconButton label={`Copiar IP ${address}`} onClick={() => onCopy(address)}><Copy size={14} /></IconButton></span>)}</div> : <span className="network-no-members">Nenhum endereço IPv4 local encontrado</span>}<small>Use o IP da mesma rede para acessar serviços publicados neste computador.</small></section>
}

function NetworkConnectionsDialog({ network, containers, busy, onClose, onConnect, onDisconnect }: {
  network?: Network
  containers: Container[]
  busy: boolean
  onClose: () => void
  onConnect: (containerId: string) => void
  onDisconnect: (containerId: string, containerName: string) => void
}) {
  const [selectedContainer, setSelectedContainer] = useState('')
  if (!network) return null
  const connectedIds = new Set(network.containers.map((container) => container.id))
  const availableContainers = containers.filter((container) => !connectedIds.has(container.id))

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><section className="modal network-modal" role="dialog" aria-modal="true" aria-labelledby="network-dialog-title"><div className="modal-head"><div className="modal-title-wrap"><span className="dialog-icon"><NetworkIcon size={18} /></span><div><span className="modal-kicker">REDE DOCKER</span><h2 id="network-dialog-title">{network.name}</h2></div></div><button className="close-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></div>
    <div className="network-dialog-content"><div className="network-dialog-address"><span>Sub-rede <code>{network.subnet || 'não informada'}</code></span><span>Gateway <code>{network.gateway || 'não informado'}</code></span></div>
      <div className="network-dialog-section"><div className="network-dialog-heading"><strong>Containers nesta rede</strong><span>{network.containers.length}</span></div>
        {network.containers.length ? <div className="network-connected-list">{network.containers.map((container) => <div className="network-connected-row" key={container.id}><span className="resource-icon container"><ContainerIcon size={15} /></span><span className="network-connected-name"><strong>{container.name}</strong><small>{container.status}</small></span><code>{container.ipv4_address || 'IP pendente'}</code><IconButton label={`Desconectar ${container.name}`} onClick={() => onDisconnect(container.id, container.name)} disabled={busy} danger><Unlink size={15} /></IconButton></div>)}</div> : <div className="network-empty-members">Ainda não há containers associados.</div>}
      </div>
      <form className="network-connect-form" onSubmit={(event) => { event.preventDefault(); if (selectedContainer) onConnect(selectedContainer) }}><label>Adicionar container<select value={selectedContainer} onChange={(event) => setSelectedContainer(event.target.value)}><option value="">Selecione um container</option>{availableContainers.map((container) => <option value={container.id} key={container.id}>{container.name} · {container.status}</option>)}</select></label><button className="primary-button" type="submit" disabled={busy || !selectedContainer}><LinkIcon size={15} />Conectar</button></form>
      <small className="network-dialog-hint">Em redes bridge criadas pelo usuário, os containers também podem se comunicar usando o nome um do outro.</small>
    </div>
    <div className="modal-actions network-modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Fechar</button></div>
  </section></div>
}

function suggestedContainerPath(image: string) {
  const normalized = image.toLowerCase()
  if (normalized.includes('nginx')) return '/usr/share/nginx/html'
  if (normalized.includes('httpd')) return '/usr/local/apache2/htdocs'
  if (normalized.includes('apache2') || (normalized.includes('php') && normalized.includes('apache')) || normalized.includes('apache')) return '/var/www/html'
  if (normalized.includes('mysql') || normalized.includes('mariadb')) return '/var/lib/mysql'
  return '/app/data'
}

function ResourceDialog({ kind, images, volumes, busy, onClose, onSubmit }: { kind: Exclude<DialogKind, 'logs' | 'shell' | 'network-members'>; images: Image[]; volumes: Volume[]; busy: boolean; onClose: () => void; onSubmit: (values: Record<string, FormDataEntryValue>) => void }) {
  const imageOptions = [...new Set(images.flatMap((image) => image.tags.filter((tag) => tag && tag !== '<none>:<none>')))]
  const [imageSource, setImageSource] = useState(imageOptions[0] || '__manual__')
  const [portMappings, setPortMappings] = useState([{ host: '', container: '' }])
  const [persistData, setPersistData] = useState(false)
  const [volumeKind, setVolumeKind] = useState<'volume' | 'bind'>('volume')
  const [hostSystem, setHostSystem] = useState('windows')
  const [volumeTarget, setVolumeTarget] = useState(suggestedContainerPath(imageOptions[0] || ''))
  const [copyInitialData, setCopyInitialData] = useState(true)
  useEffect(() => { setVolumeTarget(suggestedContainerPath(imageSource)) }, [imageSource])
  const config = {
    container: { title: 'Novo container', kicker: 'CRIAR RECURSO', submit: 'Criar container', icon: ContainerIcon },
    image: { title: 'Baixar imagem', kicker: 'DOCKER HUB', submit: 'Baixar imagem', icon: Download },
    volume: { title: 'Novo volume', kicker: 'PERSISTÊNCIA', submit: 'Criar volume', icon: HardDrive },
    network: { title: 'Nova rede', kicker: 'CONECTIVIDADE', submit: 'Criar rede', icon: NetworkIcon },
  }[kind]
  const Icon = config.icon
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="resource-dialog-title"><div className="modal-head"><div className="modal-title-wrap"><span className="dialog-icon"><Icon size={18} /></span><div><span className="modal-kicker">{config.kicker}</span><h2 id="resource-dialog-title">{config.title}</h2></div></div><button className="close-button" onClick={onClose} aria-label="Fechar" disabled={busy}><X size={19} /></button></div>
    <form className="resource-form" onSubmit={(event) => {
      event.preventDefault()
      const formData = new FormData(event.currentTarget)
      const values = Object.fromEntries(formData.entries())
      if (kind === 'container') {
        values.image = imageSource === '__manual__' ? String(formData.get('customImage') || '') : imageSource
        values.portMappings = JSON.stringify(portMappings)
        values.volumeKind = volumeKind
      }
      onSubmit(values)
    }}>
      {kind === 'container' && <>
        <label>Nome do container<input name="name" required autoFocus placeholder="ex.: web-app" /></label>
        <label>Imagem Docker<select value={imageSource} onChange={(event) => setImageSource(event.target.value)}>{imageOptions.length > 0 && <optgroup label="Imagens locais">{imageOptions.map((image) => <option value={image} key={image}>{image}</option>)}</optgroup>}<option value="__manual__">Informar outra imagem...</option></select><small>Selecione uma imagem local ou informe uma referência do Docker Hub.</small></label>
        {imageSource === '__manual__' && <label>Nome da imagem<input name="customImage" required autoFocus placeholder="ex.: nginx:latest" onChange={(event) => setVolumeTarget(suggestedContainerPath(event.target.value))} /><small>Use o repositório e, opcionalmente, uma tag.</small></label>}
        <div className="volume-setup">
          <label className="volume-toggle"><input type="checkbox" name="persistData" checked={persistData} onChange={(event) => setPersistData(event.target.checked)} /><span><strong>Guardar os dados deste container</strong><small>Os arquivos continuam salvos mesmo se o container for removido.</small></span></label>
          {persistData && <div className="volume-fields">
            <label>Tipo de armazenamento<select name="volumeKind" value={volumeKind} onChange={(event) => setVolumeKind(event.target.value as 'volume' | 'bind')}><option value="volume">Volume gerenciado pelo Docker</option><option value="bind">Pasta do computador (bind)</option></select><small>Docker gerencia o volume; pasta do computador facilita localizar os arquivos.</small></label>
            {volumeKind === 'volume' ? <><label>Volume Docker<select name="volumeName" defaultValue="__new__"><option value="__new__">Criar automaticamente</option>{volumes.map((volume) => <option value={volume.name} key={volume.name}>Reutilizar {volume.name}</option>)}</select><small>O nome será criado automaticamente a partir do container.</small></label><small className="volume-guidance">Volumes Docker preservam os arquivos iniciais da imagem quando criados pela primeira vez.</small></> : <>
              <label>Sistema do computador<select name="hostSystem" value={hostSystem} onChange={(event) => setHostSystem(event.target.value)}><option value="windows">Windows</option><option value="linux">Linux</option><option value="macos">macOS</option></select></label>
              <label>Pasta no computador<input name="hostPath" required placeholder={hostSystem === 'windows' ? 'ex.: C:\\Users\\Ana\\docker-data\\site' : hostSystem === 'macos' ? 'ex.: /Users/ana/docker-data/site' : 'ex.: /home/ana/docker-data/site'} /><small>A pasta precisa existir no computador onde o Docker está executando.</small></label>
              <label className="volume-toggle"><input type="checkbox" name="copyInitialData" checked={copyInitialData} onChange={(event) => setCopyInitialData(event.target.checked)} /><span><strong>Copiar arquivos iniciais do container</strong><small>Usado apenas se a pasta do computador estiver vazia; arquivos existentes não serão substituídos.</small></span></label>
              <small className="volume-guidance">O bind usa os arquivos desta pasta no lugar dos arquivos originais do container.</small>
            </>}
            <label>Pasta usada pelo aplicativo<input name="volumeTarget" required value={volumeTarget} onChange={(event) => setVolumeTarget(event.target.value)} placeholder="ex.: /var/lib/mysql" /><small>Sugestão para {imageSource === '__manual__' ? 'esta imagem' : imageSource}; você pode alterar.</small></label>
          </div>}
        </div>
        <div className="port-mappings"><div className="port-heading"><span>Mapeamento de portas</span><span className="optional-label">opcional</span></div>{portMappings.map((mapping, index) => <div className="port-row" key={index}><label>Porta local (host)<input type="number" min="1" max="65535" inputMode="numeric" value={mapping.host} placeholder="ex.: 8080" onChange={(event) => setPortMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, host: event.target.value } : item))} /></label><span className="port-arrow" aria-hidden="true">→</span><label>Porta no container<input type="number" min="1" max="65535" inputMode="numeric" value={mapping.container} placeholder="ex.: 80" onChange={(event) => setPortMappings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, container: event.target.value } : item))} /></label>{portMappings.length > 1 && <button className="port-remove" type="button" title="Remover mapeamento" aria-label="Remover mapeamento de porta" onClick={() => setPortMappings((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button>}</div>)}<button className="add-port-button" type="button" onClick={() => setPortMappings((current) => [...current, { host: '', container: '' }])}><Plus size={14} />Adicionar porta</button><small>Porta local recebe conexões do host e encaminha para a porta interna do container.</small></div>
        <label>Política de reinício<select name="restart_policy" defaultValue="no"><option value="no">Não reiniciar</option><option value="always">Sempre</option><option value="unless-stopped">Exceto se parado</option><option value="on-failure">Em caso de falha</option></select></label>
      </>}
      {kind === 'image' && <label>Nome da imagem<input name="name" required autoFocus placeholder="ex.: nginx:latest" /><small>Use o nome do repositório e, opcionalmente, uma tag.</small></label>}
      {kind === 'volume' && <><label>Nome do volume<input name="name" required autoFocus placeholder="ex.: app-data" /></label><label>Driver<select name="driver" defaultValue="local"><option value="local">local</option></select></label></>}
      {kind === 'network' && <><label>Nome da rede<input name="name" required autoFocus placeholder="ex.: frontend-net" /></label><label>Driver<select name="driver" defaultValue="bridge"><option value="bridge">bridge</option><option value="host">host</option><option value="overlay">overlay</option><option value="macvlan">macvlan</option></select></label></>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy ? <LoaderCircle size={16} className="spinning" /> : <Icon size={16} />}{busy ? 'Processando...' : config.submit}</button></div>
    </form>
  </section></div>
}

function ContainerShellDialog({ containerId, title, onClose }: { containerId: string; title: string; onClose: () => void }) {
  const [shell, setShell] = useState('/bin/sh')
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState('Terminal pronto.')
  const [busy, setBusy] = useState(false)

  async function runCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const entered = command.trim()
    if (!entered || busy) return
    setBusy(true)
    setCommand('')
    setOutput((current) => `${current}\n$ ${entered}\n`)
    try {
      const result = await request<{ exit_code: number; output: string }>(`/api/containers/${encodeURIComponent(containerId)}/exec`, {
        method: 'POST',
        body: JSON.stringify({ command: entered, shell }),
      })
      setOutput((current) => `${current}${result.output || '(sem saída)'}\n[ código ${result.exit_code} ]\n`)
    } catch (reason) {
      setOutput((current) => `${current}${reason instanceof Error ? reason.message : 'Comando não executado.'}\n`)
    } finally {
      setBusy(false)
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><section className="modal logs-modal shell-modal" role="dialog" aria-modal="true" aria-labelledby="shell-title"><div className="modal-head"><div><span className="modal-kicker">TERMINAL DO CONTAINER</span><h2 id="shell-title">{title}</h2></div><button className="close-button" onClick={onClose} aria-label="Fechar" disabled={busy}><X size={19} /></button></div><div className="logs-toolbar"><TerminalSquare size={15} /><label>Shell<select value={shell} onChange={(event) => setShell(event.target.value)} disabled={busy}><option value="/bin/sh">sh</option><option value="/bin/bash">bash</option><option value="cmd.exe">Windows cmd</option></select></label><span>Cada comando inicia um processo novo.</span></div><pre className="logs-output shell-output">{output}{busy && <span className="logs-loading"><LoaderCircle size={15} className="spinning" />Executando...</span>}</pre><form className="shell-command-form" onSubmit={(event) => void runCommand(event)}><span aria-hidden="true">&gt;_</span><input aria-label="Comando para executar" autoFocus value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Digite um comando..." disabled={busy} /><button type="submit" title="Executar comando" aria-label="Executar comando" disabled={busy || !command.trim()}><Play size={16} /></button></form></section></div>
}

export default App