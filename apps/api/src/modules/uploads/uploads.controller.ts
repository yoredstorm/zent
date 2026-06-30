import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const DOC_EXT = new Set(['.pdf', '.doc', '.docx']);

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function storageFor(folder: 'images' | 'pdf') {
  return diskStorage({
    destination: (_req, _file, cb) => {
      const uploadsDir = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
      const dest = join(uploadsDir, folder);
      ensureDir(dest);
      cb(null, dest);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
    },
  });
}

@ApiTags('uploads')
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private config: ConfigService) {}

  private publicUrl(relativePath: string): string {
    const base = this.config.get('PUBLIC_API_URL', '').replace(/\/$/, '');
    return `${base || '/api'}${relativePath}`;
  }

  @Post('image')
  @ApiOperation({ summary: 'Upload image for WhatsApp or catalog' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: storageFor('images'),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!IMAGE_EXT.has(ext)) {
          cb(new BadRequestException('Solo imágenes JPG, PNG, WEBP o GIF'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const url = `/api/uploads/images/${file.filename}`;
    return { url, publicUrl: this.publicUrl(url) };
  }

  @Post('document')
  @ApiOperation({ summary: 'Upload document (PDF) for WhatsApp' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: storageFor('pdf'),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!DOC_EXT.has(ext)) {
          cb(new BadRequestException('Solo PDF o documentos permitidos'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadDocument(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const url = `/api/uploads/pdf/${file.filename}`;
    return { url, publicUrl: this.publicUrl(url) };
  }
}
