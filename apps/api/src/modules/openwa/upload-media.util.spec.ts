import { parseUploadLocation } from './upload-media.util';

describe('parseUploadLocation', () => {
  it('parses relative api upload paths', () => {
    expect(parseUploadLocation('/api/uploads/pdf/catalogo.pdf')).toEqual({
      folder: 'pdf',
      filename: 'catalogo.pdf',
    });
  });

  it('parses absolute public URLs', () => {
    expect(
      parseUploadLocation('https://zent.example.com/api/uploads/images/photo.png'),
    ).toEqual({
      folder: 'images',
      filename: 'photo.png',
    });
  });

  it('returns null for external urls', () => {
    expect(parseUploadLocation('https://cdn.example.com/photo.png')).toBeNull();
  });
});
