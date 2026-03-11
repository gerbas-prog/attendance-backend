// src/gateway/attendance.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/attendance',
})
export class AttendanceGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(AttendanceGateway.name);
  private connectedClients = new Map<string, { userId: string; companyId: string; role: string }>();

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('🔌 WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) throw new Error('No token provided');

      const payload = this.jwt.verify(token, { secret: this.config.get('JWT_SECRET') });
      const { sub: userId, companyId, role } = payload as any;

      client.data.userId = userId;
      client.data.companyId = companyId;
      client.data.role = role;

      // Join company-specific room
      await client.join(`company:${companyId}`);

      // Admin/Supervisor joins admin room for live tracking
      if (['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'].includes(role)) {
        await client.join(`admin:${companyId}`);
      }

      this.connectedClients.set(client.id, { userId, companyId, role });
      this.logger.log(`Client connected: ${client.id} | User: ${userId} | Role: ${role}`);

      // Send initial connection confirmation
      client.emit('connected', {
        message: 'Connected to attendance real-time server',
        userId,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      this.logger.warn(`Unauthorized connection attempt: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Emit attendance update to all admins in a company
  async emitAttendanceUpdate(companyId: string, data: any) {
    this.server.to(`admin:${companyId}`).emit('attendance:update', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  // Emit to specific user
  async emitToUser(userId: string, event: string, data: any) {
    const clients = await this.server.fetchSockets();
    for (const client of clients) {
      if (client.data.userId === userId) {
        client.emit(event, data);
      }
    }
  }

  // Emit live tracking refresh signal
  async emitLiveTrackingRefresh(companyId: string) {
    this.server.to(`admin:${companyId}`).emit('live:refresh');
  }

  // Client subscribes to specific user location updates
  @SubscribeMessage('track:user')
  handleTrackUser(
    @MessageBody() data: { targetUserId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { role } = client.data;
    if (!['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'].includes(role)) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }
    client.join(`track:${data.targetUserId}`);
    this.logger.log(`Client ${client.id} tracking user ${data.targetUserId}`);
  }

  // Employee sends location update (for live field tracking)
  @SubscribeMessage('location:update')
  handleLocationUpdate(
    @MessageBody() data: { latitude: number; longitude: number; accuracy: number },
    @ConnectedSocket() client: Socket,
  ) {
    const { userId, companyId } = client.data;
    
    // Broadcast to anyone tracking this user
    this.server.to(`track:${userId}`).emit('user:location', {
      userId,
      ...data,
      timestamp: new Date().toISOString(),
    });

    // Also broadcast to admin room
    this.server.to(`admin:${companyId}`).emit('field:location', {
      userId,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  // Get connected users count per company
  @SubscribeMessage('online:count')
  async handleOnlineCount(@ConnectedSocket() client: Socket) {
    const { companyId } = client.data;
    const sockets = await this.server.in(`company:${companyId}`).fetchSockets();
    client.emit('online:count', {
      count: sockets.length,
      timestamp: new Date().toISOString(),
    });
  }

  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
}
