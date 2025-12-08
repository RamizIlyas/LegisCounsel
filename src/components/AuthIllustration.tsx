// AuthIllustration.tsx
import { Scale } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

export function AuthIllustration() {
  return (
    <div className="hidden md:flex flex-col justify-center items-center bg-gradient-to-br from-[#1E3A8A] to-[#1E3A8A]/80 p-12 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-md">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Scale className="h-10 w-10 text-[#D4AF37]" />
            <span className="text-white text-3xl font-bold">LegisCounsel</span>
          </div>
          <h2 className="text-white text-4xl font-semibold mb-4">
            Welcome to the Future of Legal Research
          </h2>
          <p className="text-white/80 text-lg">
            Access millions of legal documents, powered by advanced AI.
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-2xl">
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1748346918817-0b1b6b2f9bab?..."
            alt="Professional workspace"
            className="w-full h-80 object-cover"
          />
        </div>
      </div>
    </div>
  );
}
