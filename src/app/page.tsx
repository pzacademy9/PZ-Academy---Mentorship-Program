import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#1A4D2E] flex flex-col items-center justify-center text-white px-6">
      <div className="max-w-4xl w-full text-center">
        <div className="flex justify-center mb-8">
           <Image
             src="/pz-logo.png"
             alt="PZ Academy Logo"
             width={120}
             height={120}
             className="object-contain"
           />
        </div>
        
        <h1 className="font-montserrat text-5xl md:text-7xl font-black mb-4 uppercase tracking-tighter">
          PZ Academy
        </h1>
        
        <p className="font-poppins text-xl md:text-2xl text-white/70 mb-12 max-w-2xl mx-auto">
          Empowering the next generation of professionals through elite mentorship and specialized training.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Link 
            href="/mentorship"
            className="group p-8 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-left"
          >
            <h2 className="font-montserrat text-2xl font-bold text-[#C9A84C] mb-2">Mentorship Program</h2>
            <p className="font-poppins text-sm text-white/60 mb-4">
              Get 1-on-1 guidance from verified industry experts to accelerate your career.
            </p>
            <div className="flex items-center text-white font-bold text-sm uppercase tracking-wider gap-2">
              Explore Mentors
              <span className="group-hover:translate-x-2 transition-transform">→</span>
            </div>
          </Link>

          <div className="p-8 bg-white/5 border border-white/10 rounded-2xl opacity-50 relative overflow-hidden">
             <div className="absolute top-4 right-4 bg-[#C9A84C] text-[#1A4D2E] text-[10px] font-bold px-2 py-1 rounded uppercase">Coming Soon</div>
            <h2 className="font-montserrat text-2xl font-bold text-white/40 mb-2">Academy Courses</h2>
            <p className="font-poppins text-sm text-white/30">
              Structured learning paths and certifications for high-demand skills.
            </p>
          </div>
        </div>
      </div>

      <footer className="mt-20 py-8 text-white/30 font-poppins text-xs tracking-widest uppercase">
        © {new Date().getFullYear()} PZ Academy • Excellence through Mentorship
      </footer>
    </main>
  );
}
