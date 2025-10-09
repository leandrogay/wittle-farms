export default function AnimatedBackground({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-light-bg via-light-bg-secondary to-light-surface dark:from-dark-bg dark:via-dark-bg-secondary dark:to-dark-surface relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-brand-primary/20 to-transparent dark:from-brand-secondary/20 rounded-full blur-3xl animate-gradient"
          style={{
            backgroundSize: '200% 200%',
          }}
        />
        <div 
          className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-info/20 to-transparent dark:from-info/10 rounded-full blur-3xl animate-gradient"
          style={{
            backgroundSize: '200% 200%',
            animationDelay: '2s',
          }}
        />
      </div>
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}