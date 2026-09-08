import { Device } from 'mediasoup-client';

type SfuMode = 'call' | 'live';
type SfuRole = 'publisher' | 'viewer';
type MediaState = { isMuted: boolean; isVideoOn: boolean; isScreenSharing: boolean; isHandRaised?: boolean };
type ProducerInfo = { producerId: string; peerId: string; userId: string; kind: 'audio' | 'video'; appData?: Record<string, unknown> };
type ReadyMessage = { type: 'ready'; peerId: string; userId: string; routerRtpCapabilities: any; producers: ProducerInfo[]; peerCount: number; viewerCount: number };
type Options = {
  url: string; roomId: string; mode: SfuMode; role: SfuRole; accessToken: string;
  onRemoteStream?: (peerId: string, userId: string, stream: MediaStream | null) => void;
  onPeerState?: (peerId: string, userId: string, state: MediaState) => void;
  onPeerLeft?: (peerId: string, userId: string) => void;
  onPeerCount?: (peerCount: number, viewerCount: number) => void;
  onConnectionState?: (connected: boolean) => void;
  onError?: (message: string) => void;
};
type PendingRequest = { resolve: (value: any) => void; reject: (reason?: unknown) => void; timer: number };

export class SfuClient {
  private ws: WebSocket | null = null;
  private device: Device | null = null;
  private sendTransport: any = null;
  private recvTransport: any = null;
  private readonly producers = new Map<'audio' | 'video', any>();
  private readonly consumers = new Map<string, any>();
  private readonly remoteStreams = new Map<string, MediaStream>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly queuedProducers: ProducerInfo[] = [];
  private closed = false;
  constructor(private readonly options: Options) {}

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.closed = false;
    const ws = new WebSocket(this.options.url);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('SFU websocket timeout')), 12000);
      ws.onopen = () => { window.clearTimeout(timer); resolve(); };
      ws.onerror = () => { window.clearTimeout(timer); reject(new Error('SFU websocket connection failed')); };
    });
    ws.onmessage = (event) => this.handleMessage(event.data);
    ws.onclose = () => {
      this.options.onConnectionState?.(false);
      if (!this.closed) this.options.onError?.('SFU connection closed');
      this.rejectPending(new Error('SFU connection closed'));
    };
    const ready = await new Promise<ReadyMessage>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('SFU authentication timeout')), 12000);
      const onReady = (event: MessageEvent) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'ready') { window.clearTimeout(timer); ws.removeEventListener('message', onReady); resolve(message); }
          else if (message.type === 'error') { window.clearTimeout(timer); ws.removeEventListener('message', onReady); reject(new Error(message.error || 'SFU authentication failed')); }
        } catch { /* ignore */ }
      };
      ws.addEventListener('message', onReady);
      ws.send(JSON.stringify({ type: 'auth', roomId: this.options.roomId, mode: this.options.mode, role: this.options.role, accessToken: this.options.accessToken }));
    });
    const device = new Device();
    await device.load({ routerRtpCapabilities: ready.routerRtpCapabilities });
    this.device = device;
    await this.ensureRecvTransport();
    if (this.options.role === 'publisher') await this.ensureSendTransport();
    this.options.onPeerCount?.(ready.peerCount, ready.viewerCount);
    for (const info of ready.producers) await this.consumeProducer(info);
    while (this.queuedProducers.length) { const info = this.queuedProducers.shift(); if (info) await this.consumeProducer(info); }
    this.options.onConnectionState?.(true);
  }

  async publish(stream: MediaStream): Promise<void> {
    await this.ensureSendTransport();
    for (const track of stream.getTracks()) if (track.kind === 'audio' || track.kind === 'video') await this.publishTrack(track as MediaStreamTrack & { kind: 'audio' | 'video' });
  }
  async replaceStream(stream: MediaStream): Promise<void> {
    const audio = stream.getAudioTracks()[0]; const video = stream.getVideoTracks()[0];
    if (audio) await this.replaceTrack('audio', audio); if (video) await this.replaceTrack('video', video);
  }
  async replaceTrack(kind: 'audio' | 'video', track: MediaStreamTrack): Promise<void> {
    const producer = this.producers.get(kind);
    if (producer) await producer.replaceTrack({ track }); else await this.publishTrack(track as MediaStreamTrack & { kind: 'audio' | 'video' });
  }
  sendMediaState(state: MediaState): void { void this.request('mediaState', state).catch(() => undefined); }
  close(): void {
    this.closed = true;
    this.producers.forEach((p) => p.close()); this.producers.clear();
    this.consumers.forEach((c) => c.close()); this.consumers.clear(); this.remoteStreams.clear();
    this.sendTransport?.close(); this.recvTransport?.close(); this.sendTransport = null; this.recvTransport = null;
    this.ws?.close(); this.ws = null; this.rejectPending(new Error('SFU client closed')); this.options.onConnectionState?.(false);
  }

  private async ensureSendTransport(): Promise<void> {
    if (this.sendTransport) return; if (!this.device) throw new Error('SFU device is not ready');
    const params = await this.request('createTransport', { direction: 'send' });
    const transport = this.device.createSendTransport(params);
    transport.on('connect', ({ dtlsParameters }: any, callback: () => void, errback: (error: Error) => void) => this.request('connectTransport', { transportId: transport.id, dtlsParameters }).then(callback).catch(errback));
    transport.on('produce', ({ kind, rtpParameters, appData }: any, callback: (value: { id: string }) => void, errback: (error: Error) => void) => this.request('produce', { transportId: transport.id, kind, rtpParameters, appData }).then(({ id }) => callback({ id })).catch(errback));
    transport.on('connectionstatechange', (state: string) => { if (state === 'failed' || state === 'closed') this.options.onConnectionState?.(false); });
    this.sendTransport = transport;
  }
  private async ensureRecvTransport(): Promise<void> {
    if (this.recvTransport) return; if (!this.device) throw new Error('SFU device is not ready');
    const params = await this.request('createTransport', { direction: 'recv' });
    const transport = this.device.createRecvTransport(params);
    transport.on('connect', ({ dtlsParameters }: any, callback: () => void, errback: (error: Error) => void) => this.request('connectTransport', { transportId: transport.id, dtlsParameters }).then(callback).catch(errback));
    transport.on('connectionstatechange', (state: string) => { if (state === 'failed' || state === 'closed') this.options.onConnectionState?.(false); });
    this.recvTransport = transport;
  }
  private async publishTrack(track: MediaStreamTrack & { kind: 'audio' | 'video' }): Promise<void> {
    await this.ensureSendTransport();
    const current = this.producers.get(track.kind); if (current) { await current.replaceTrack({ track }); return; }
    const producer = await this.sendTransport.produce({
      track,
      encodings: track.kind === 'video' ? [
        { rid: 'q', maxBitrate: 180000, scaleResolutionDownBy: 4 },
        { rid: 'h', maxBitrate: 550000, scaleResolutionDownBy: 2 },
        { rid: 'f', maxBitrate: 1800000, scaleResolutionDownBy: 1 },
      ] : undefined,
      codecOptions: track.kind === 'video' ? { videoGoogleStartBitrate: 900 } : undefined,
      appData: { source: track.kind },
    });
    this.producers.set(track.kind, producer);
    producer.on('transportclose', () => this.producers.delete(track.kind));
    producer.on('trackended', () => { void this.request('closeProducer', { producerId: producer.id }).catch(() => undefined); this.producers.delete(track.kind); });
  }
  private async consumeProducer(info: ProducerInfo): Promise<void> {
    if (this.consumers.has(info.producerId)) return;
    if (!this.device || !this.recvTransport) { this.queuedProducers.push(info); return; }
    const data = await this.request('consume', { transportId: this.recvTransport.id, producerId: info.producerId, rtpCapabilities: this.device.rtpCapabilities });
    const consumer = await this.recvTransport.consume({ id: data.id, producerId: data.producerId, kind: data.kind, rtpParameters: data.rtpParameters, appData: data.appData });
    this.consumers.set(info.producerId, consumer);
    let stream = this.remoteStreams.get(info.peerId); if (!stream) { stream = new MediaStream(); this.remoteStreams.set(info.peerId, stream); }
    stream.addTrack(consumer.track); this.options.onRemoteStream?.(info.peerId, info.userId, new MediaStream(stream.getTracks()));
    const cleanup = () => this.removeConsumer(info.producerId, info.peerId, info.userId);
    consumer.on('transportclose', cleanup); consumer.on('producerclose', cleanup);
    await this.request('resumeConsumer', { consumerId: consumer.id }); consumer.resume();
  }
  private removeConsumer(producerId: string, peerId: string, userId: string): void {
    const consumer = this.consumers.get(producerId); if (!consumer) return; this.consumers.delete(producerId);
    try { consumer.close(); } catch { /* noop */ }
    const stream = this.remoteStreams.get(peerId); if (!stream) return;
    stream.getTracks().filter((t) => t.id === consumer.track?.id).forEach((t) => stream!.removeTrack(t));
    if (!stream.getTracks().length) { this.remoteStreams.delete(peerId); this.options.onRemoteStream?.(peerId, userId, null); }
    else this.options.onRemoteStream?.(peerId, userId, new MediaStream(stream.getTracks()));
  }
  private handleMessage(raw: unknown): void {
    let message: any; try { message = JSON.parse(String(raw)); } catch { return; }
    if (message.requestId) {
      const pending = this.pending.get(message.requestId); if (!pending) return; window.clearTimeout(pending.timer); this.pending.delete(message.requestId);
      if (message.ok) pending.resolve(message.data); else pending.reject(new Error(message.error || 'SFU request failed')); return;
    }
    if (message.type === 'newProducer') { void this.consumeProducer(message.producer).catch((e) => this.options.onError?.(String(e))); return; }
    if (message.type === 'producerClosed') { this.removeConsumer(message.producerId, message.peerId, message.userId); return; }
    if (message.type === 'peerState') { this.options.onPeerState?.(message.peerId, message.userId, message.state); return; }
    if (message.type === 'peerLeft') { this.options.onPeerLeft?.(message.peerId, message.userId); return; }
    if (message.type === 'peerCount') { this.options.onPeerCount?.(message.peerCount, message.viewerCount); return; }
    if (message.type === 'error') this.options.onError?.(message.error || 'SFU error');
  }
  private request(action: string, data: Record<string, unknown> = {}): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('SFU websocket is not open'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { this.pending.delete(requestId); reject(new Error(`SFU request timed out: ${action}`)); }, 12000);
      this.pending.set(requestId, { resolve, reject, timer }); this.ws!.send(JSON.stringify({ requestId, action, data }));
    });
  }
  private rejectPending(error: Error): void { for (const p of this.pending.values()) { window.clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
}
