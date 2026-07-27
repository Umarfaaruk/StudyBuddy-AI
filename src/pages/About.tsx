import { useEffect } from "react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { Target, Lightbulb } from "lucide-react";

const About = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />
      
      <main className="flex-grow pt-32 pb-24">
        <div className="container max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
              About <span className="text-primary">StudyBuddy AI</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              We're revolutionizing the way students learn, practice, and succeed through completely personalized AI-driven education.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 mt-20">
            <div className="bg-card border border-border rounded-3xl p-8 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
              <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center mb-6">
                <Target className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
              <p className="text-muted-foreground leading-relaxed">
                To democratize expert-level tutoring by providing an AI companion that adapts to every individual's learning style, unblocking students instantly.
              </p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-8 hover:shadow-lg hover:border-primary/30 transition-all duration-300">
              <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center mb-6">
                <Lightbulb className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Our Vision</h2>
              <p className="text-muted-foreground leading-relaxed">
                A world where no student feels stuck or left behind, and where curiosity is instantly rewarded with clear, patient explanations and robust learning loops.
              </p>
            </div>
          </div>
          
          <div className="mt-24 text-center bg-card border border-border rounded-3xl p-12 hover:shadow-lg transition-all duration-300">
            <h2 className="text-3xl font-bold mb-8">Why We Built This</h2>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-4xl mx-auto">
              Traditional education often moves at a fixed pace, leaving some behind and boring others. With the rise of advanced logic models, we realized we could create a platform that essentially acts as a hyper-patient, infinitely knowledgeable tutor available 24/7. StudyBuddy AI bridges the gap between structured curriculum and autonomous, personalized study.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default About;
