import {apiFetch,apiJson,apiUrl,uploadMedia} from './api-client';
export type ServerMedia={id:string;reportId:string;kind:'image'|'video'|'audio';name:string;type:string;size:number;blob:Blob};
type MediaRow={id:string;report_id:string;kind:ServerMedia['kind'];original_name:string;mime_type:string;size_bytes:number;url:string};
export async function uploadReportMedia(reportId:string,attachments:Array<{kind:ServerMedia['kind'];file:File}>) {
  for(const attachment of attachments)await uploadMedia(reportId,attachment.file,attachment.file.name,attachment.kind);
}
export async function downloadReportMedia(reportId:string):Promise<ServerMedia[]> {
  const result=await apiJson<{media:MediaRow[]}>(`/api/reports/${encodeURIComponent(reportId)}/media`);
  const items=await Promise.allSettled(result.media.map(async(item)=>{
    const response=await apiFetch(item.url);
    if(!response.ok)throw new Error('파일을 불러오지 못했습니다.');
    return {id:item.id,reportId:item.report_id,kind:item.kind,name:item.original_name,type:item.mime_type,size:item.size_bytes,blob:await response.blob()};
  }));
  return items.flatMap(item=>item.status==='fulfilled'?[item.value]:[]);
}
export function publicReportPreviewUrl(reportId:string) {return apiUrl(`/api/map/reports/${encodeURIComponent(reportId)}/preview`);}
