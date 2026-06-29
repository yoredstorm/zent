import { Injectable, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const PDF_MIMES = new Set(['application/pdf']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PDF_MAX = 20 * 1024 * 1024;
const IMAGE_MAX = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private readonly uploadsDir: string;
  private readonly publicBaseUrl: string;

  constructor(private config: ConfigService) {
    this.uploadsDir = this.config.get('UPLOADS_DIR', './uploads');
    this.publicBaseUrl = this.config.get('PUBLIC_API_URL', 'http://localhost:3000/api').replace(/\/$/, '');
  }

  onModuleInit() {
    this.ensureDirs();
  }

  private ensureDirs() {
    try {
      fs.mkdirSync(path.join(this.uploadsDir, 'pdf'), { recursive: true });
      fs.mkdirSync(path.join(this.uploadsDir, 'images'), { recursive: true });
    } catch (err: any) {
      this.logger.warn(`Could not create uploads directories: ${err?.message}`);
    }
  }

  getUploadsDir(): string {
    return this.uploadsDir;
  }

  saveFile(file: Express.Multer.File, type: 'pdf' | 'images'): { url: string; filename: string } {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file provided');
    }

    const isPdf = type === 'pdf';
    const allowed = isPdf ? PDF_MIMES : IMAGE_MIMES;
    const maxSize = isPdf ? PDF_MAX : IMAGE_MAX;

    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException(`Invalid file type: ${file.mimetype}`);
    }
    if (file.size > maxSize) {
      throw new BadRequestException(`File too large (max ${isPdf ? '20MB' : '5MB'})`);
    }

    const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname) || '';
    const filename = `${randomUUID()}${ext}`;
    const filepath = path.join(this.uploadsDir, type, filename);
    try {
      this.ensureDirs();
      fs.writeFileSync(filepath, file.buffer);
    } catch (err: any) {
      throw new BadRequestException(`No se pudo guardar el archivo: ${err?.message}`);
    }

    return {
      url: `${this.publicBaseUrl}/uploads/${type}/${filename}`,
      filename,
    };
  }
}
