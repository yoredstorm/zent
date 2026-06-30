import { Controller, Sse, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Observable, interval, merge, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { RealtimeService } from './realtime.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(
    private realtime: RealtimeService,
    private jwt: JwtService,
  ) {}

  @Public()
  @Sse('stream')
  @ApiOperation({ summary: 'SSE stream for live dashboard updates (pass JWT as ?token=)' })
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    if (!token) throw new UnauthorizedException('token query param required');
    try {
      this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('invalid token');
    }

    return merge(
      of({ type: 'connected', at: new Date().toISOString() }),
      interval(25_000).pipe(map(() => ({ type: 'ping', at: new Date().toISOString() }))),
      this.realtime.events$,
    ).pipe(map((event) => ({ data: event }) as MessageEvent));
  }
}
