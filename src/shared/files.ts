// Arquivos guardados pelo Mello (anexos, capas e, na etapa 9, fundos): o endereço que a tela usa
// para mostrá-los e o que conta como imagem. O main guarda cada arquivo em
// <pasta de dados>\arquivos\<sha256>.<ext> e o protocolo mello-arquivo:// entrega só essa pasta.

export const FILE_SCHEME = 'mello-arquivo'
export const FILE_HOST = 'arquivos'

// O id de um arquivo é o SHA-256 do conteúdo (ANX-02).
export const FILE_ID = /^[a-f0-9]{64}$/

export function fileUrl(fileId: string, ext: string): string {
  return `${FILE_SCHEME}://${FILE_HOST}/${fileId}.${ext}`
}

// Imagens com miniatura e que podem ser capa (ANX-03, CAP-01): as que o Chromium mostra e de que o
// main sabe ler o tamanho. A janela de escolher a capa filtra por estas extensões.
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

// ANX-05: acima disto, a tela pede confirmação antes de copiar.
export const LARGE_FILE_BYTES = 200 * 1024 * 1024
