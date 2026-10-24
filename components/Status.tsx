import { statusLabel } from '@/lib/format';
export default function Status({value}:{value:string}){
 return <span className={`status status-${value}`}>{statusLabel(value)}</span>;
}
