"use client"

import { EnhancedGlassButton } from "@/components/ui/enhanced-glass-button"
import { EnhancedGlassCard } from "@/components/ui/enhanced-glass-card"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { motion, useScroll, useTransform } from "framer-motion"
import { 
  Brain, 
  Users, 
  GraduationCap, 
  Zap, 
  Shield, 
  TrendingUp,
  CheckCircle,
  Star,
  ArrowRight,
  Play,
  Quote,
  Award,
  Target,
  Sparkles
} from "lucide-react"
import Link from "next/link"
import { useAppStore } from "@/lib/store"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

const features = [
  {
    icon: Brain,
    title: "AI-Powered Analysis",
    description: "Advanced machine learning algorithms analyze resumes and interview performance with 95% accuracy",
    gradient: "from-blue-500 to-cyan-500"
  },
  {
    icon: Users,
    title: "Smart Candidate Ranking",
    description: "Automatically rank candidates based on job requirements, experience, and skill matching",
    gradient: "from-purple-500 to-pink-500"
  },
  {
    icon: GraduationCap,
    title: "Mock Interview Training",
    description: "Practice with realistic AI interviews, get stress analysis, and improve your performance",
    gradient: "from-green-500 to-emerald-500"
  },
  {
    icon: Zap,
    title: "Lightning Fast Processing",
    description: "Process hundreds of resumes in minutes, not hours. Get results instantly",
    gradient: "from-yellow-500 to-orange-500"
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-grade security with end-to-end encryption and GDPR compliance",
    gradient: "from-red-500 to-rose-500"
  },
  {
    icon: TrendingUp,
    title: "Performance Analytics",
    description: "Track hiring success rates and candidate performance with detailed analytics",
    gradient: "from-indigo-500 to-purple-500"
  }
]

const testimonials = [
  {
    name: "Sarah Chen",
    role: "HR Director at TechCorp",
    content: "Mock'n-Hire reduced our screening time by 80% while improving candidate quality significantly. The AI insights are incredibly accurate.",
    rating: 5,
    avatar: "SC"
  },
  {
    name: "Alex Rodriguez",
    role: "Computer Science Student",
    content: "The mock interviews helped me land my dream job. The AI feedback was incredibly detailed and helped me improve my confidence.",
    rating: 5,
    avatar: "AR"
  },
  {
    name: "Michael Kim",
    role: "Startup Founder",
    content: "As a small team, Mock'n-Hire gives us enterprise-level hiring capabilities without the overhead. Game changer for our recruitment.",
    rating: 5,
    avatar: "MK"
  }
]

const stats = [
  { number: "50K+", label: "Candidates Screened", icon: Users },
  { number: "95%", label: "Accuracy Rate", icon: Target },
  { number: "80%", label: "Time Saved", icon: Zap },
  { number: "500+", label: "Companies Trust Us", icon: Award }
]

const processSteps = {
  recruiter: [
    { title: "Upload Job Description", description: "Define your requirements and job criteria" },
    { title: "Bulk Upload Resumes", description: "Upload candidate resumes in bulk" },
    { title: "AI Analysis & Ranking", description: "Our AI analyzes and ranks candidates" },
    { title: "Review Top Candidates", description: "Review detailed match scores and insights" },
    { title: "Make Hiring Decisions", description: "Shortlist and contact top candidates" }
  ],
  student: [
    { title: "Upload Your Resume", description: "Upload your resume and target role" },
    { title: "Start Mock Interview", description: "Begin AI-powered interview session" },
    { title: "Answer Questions", description: "Respond to personalized interview questions" },
    { title: "Get Real-time Analysis", description: "Receive stress and performance analysis" },
    { title: "Improve & Practice", description: "Use feedback to enhance your skills" }
  ]
}

export default function LandingPage() {
  const { user } = useAppStore()
  const router = useRouter()
  const { scrollYProgress } = useScroll()
  const heroRef = useRef<HTMLElement>(null)
  
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '50%'])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])

  useEffect(() => {
    if (user) {
      router.push(`/dashboard/${user.role}`)
    }
  }, [user, router])

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <div className="w-16 h-16 mx-auto rounded-xl gradient-bg flex items-center justify-center">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Redirecting to dashboard...</h2>
          <div className="flex items-center justify-center space-x-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-primary rounded-full"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 right-0 z-50 container-padding py-4"
      >
        <div className="glass-card px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg gradient-bg flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">Mock'n-Hire</h1>
                <p className="text-xs text-muted-foreground">AI Hiring Suite</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <Link href="/auth/login">
                <EnhancedGlassButton variant="primary">
                  Get Started
                </EnhancedGlassButton>
              </Link>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Animated Background */}
        <motion.div 
          className="absolute inset-0 opacity-30"
          style={{ y }}
        >
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
        </motion.div>

        <motion.div 
          className="relative z-10 max-w-6xl mx-auto text-center container-padding"
          style={{ opacity }}
        >
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            {/* Hero Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-full glass-card"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Powered by Advanced AI</span>
            </motion.div>
            
            {/* Main Heading */}
            <div className="space-y-6">
              <h1 className="heading-1 gradient-text">
                Next-Generation
                <br />
                AI Hiring Platform
              </h1>
              
              <p className="body-large text-muted-foreground max-w-3xl mx-auto">
                Transform your hiring process with AI-powered resume screening and mock interviews. 
                Find the perfect candidates faster than ever before with our intelligent matching system.
              </p>
            </div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            >
              <Link href="/auth/login">
                <EnhancedGlassButton
                  variant="primary"
                  size="lg"
                  icon={<ArrowRight className="w-5 h-5" />}
                >
                  Start Free Trial
                </EnhancedGlassButton>
              </Link>
              
              <EnhancedGlassButton
                size="lg"
                icon={<Play className="w-5 h-5" />}
              >
                Watch Demo
              </EnhancedGlassButton>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16"
            >
              {stats.map((stat, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1 + index * 0.1 }}
                  className="text-center"
                >
                  <div className="flex items-center justify-center w-12 h-12 mx-auto mb-3 rounded-lg bg-primary/10">
                    <stat.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                    {stat.number}
                  </div>
                  <div className="text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="section-spacing">
        <div className="max-w-6xl mx-auto container-padding">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="heading-2 mb-6">
              Powerful Features for Modern Hiring
            </h2>
            <p className="body-large text-muted-foreground max-w-3xl mx-auto">
              Everything you need to streamline your hiring process and find the best talent
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <EnhancedGlassCard className="h-full group">
                  <div className={`flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-r ${feature.gradient} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="heading-3 mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </EnhancedGlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section-spacing bg-accent/5">
        <div className="max-w-6xl mx-auto container-padding">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="heading-2 mb-6">
              How Mock'n-Hire Works
            </h2>
            <p className="body-large text-muted-foreground max-w-3xl mx-auto">
              Simple, powerful, and designed for both recruiters and candidates
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-16">
            {/* For Recruiters */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <EnhancedGlassCard gradient>
                <div className="flex items-center space-x-3 mb-6">
                  <div className="p-3 rounded-lg bg-blue-500/20">
                    <Users className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="heading-3">For Recruiters</h3>
                </div>
                
                <div className="space-y-6">
                  {processSteps.recruiter.map((step, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-start space-x-4"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-semibold text-sm flex-shrink-0 mt-1">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground mb-1">{step.title}</h4>
                        <p className="text-muted-foreground text-sm">{step.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </EnhancedGlassCard>
            </motion.div>

            {/* For Students */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <EnhancedGlassCard gradient>
                <div className="flex items-center space-x-3 mb-6">
                  <div className="p-3 rounded-lg bg-green-500/20">
                    <GraduationCap className="w-6 h-6 text-green-400" />
                  </div>
                  <h3 className="heading-3">For Students</h3>
                </div>
                
                <div className="space-y-6">
                  {processSteps.student.map((step, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-start space-x-4"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 font-semibold text-sm flex-shrink-0 mt-1">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground mb-1">{step.title}</h4>
                        <p className="text-muted-foreground text-sm">{step.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </EnhancedGlassCard>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-spacing">
        <div className="max-w-6xl mx-auto container-padding">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="heading-2 mb-6">
              Trusted by Thousands
            </h2>
            <p className="body-large text-muted-foreground max-w-3xl mx-auto">
              See what our users say about their experience with Mock'n-Hire
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <EnhancedGlassCard className="h-full">
                  <div className="flex items-center space-x-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  
                  <div className="mb-6">
                    <Quote className="w-8 h-8 text-primary/20 mb-3" />
                    <p className="text-foreground leading-relaxed">
                      {testimonial.content}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center text-white font-semibold">
                      {testimonial.avatar}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{testimonial.name}</p>
                      <p className="text-muted-foreground text-sm">{testimonial.role}</p>
                    </div>
                  </div>
                </EnhancedGlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-spacing gradient-bg">
        <div className="max-w-4xl mx-auto text-center container-padding">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div className="space-y-4">
              <h2 className="heading-2 text-white">
                Ready to Transform Your Hiring?
              </h2>
              <p className="body-large text-white/80 max-w-2xl mx-auto">
                Join thousands of companies and candidates who trust Mock'n-Hire for their hiring needs
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/auth/login">
                <EnhancedGlassButton
                  variant="outline"
                  size="lg"
                  className="bg-white text-primary hover:bg-white/90"
                  icon={<ArrowRight className="w-5 h-5" />}
                >
                  Start Free Trial
                </EnhancedGlassButton>
              </Link>
              
              <EnhancedGlassButton
                size="lg"
                className="text-white border-white/30 hover:bg-white/10"
              >
                Contact Sales
              </EnhancedGlassButton>
            </div>

            <div className="flex items-center justify-center space-x-8 text-white/60 text-sm pt-8">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span>14-day free trial</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 container-padding border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <div className="w-10 h-10 rounded-lg gradient-bg flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold gradient-text">Mock'n-Hire</h3>
                <p className="text-xs text-muted-foreground">AI Hiring Suite</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-8 text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground transition-colors focus-ring rounded">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors focus-ring rounded">
                Terms of Service
              </Link>
              <Link href="/contact" className="hover:text-foreground transition-colors focus-ring rounded">
                Contact
              </Link>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-border text-center text-muted-foreground">
            <p>&copy; 2024 Mock'n-Hire. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}