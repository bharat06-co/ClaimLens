import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import './globals.css';
export const metadata:Metadata={ title:'CLAIMLENS | Warranty Intelligence', description:'Warranty claim evaluation and semantic policy search' };
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body><Nav/>{children}<footer className="footer">CLAIMLENS <span>·</span> DBMS Level 3 <span>·</span> Policy-grounded claim review</footer></body></html>;
}
