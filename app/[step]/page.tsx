import {notFound} from 'next/navigation';
export default async function StepPage({params}:{params:Promise<{step:string}>}){
 const {step}=await params;
 if(!['jobs','resume','results'].includes(step))notFound();
 return null;
}
