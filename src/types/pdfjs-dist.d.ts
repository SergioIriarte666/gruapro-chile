declare module "pdfjs-dist/legacy/build/pdf" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: any): { promise: Promise<any> };
}

declare module "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url" {
  const workerSrc: string;
  export default workerSrc;
}

