import React from 'react';
import {
    Database, Network, ShieldAlert, Code2,
    Settings, Cpu, Terminal, Cloud,
    BarChart, Gamepad2, Laptop, Hash, BookOpen
} from 'lucide-react';

export const CATEGORIES = [
    { id: "DATABASE", name: "DATABASE", icon: Database },
    { id: "DATA_STRUCTURE", name: "DATA STRUCTURE", icon: Hash },
    { id: "JAVA", name: "JAVA", icon: Code2 },
    { id: "PYTHON", name: "PYTHON", icon: Code2 },
    { id: "C", name: "C", icon: Code2 },
    { id: "CPP", name: "C++", icon: Code2 },
    { id: "ARTIFICIAL_INTELLIGENCE", name: "ARTIFICIAL INTELLIGENCE", icon: Cpu },
    { id: "OPERATING_SYSTEM", name: "OPERATING SYSTEM", icon: Settings },
    { id: "CODE_OUTPUT", name: "CODE OUTPUT", icon: Terminal },
    { id: "GENERAL_KNOWLEDGE", name: "GENERAL KNOWLEDGE", icon: BookOpen },
    { id: "NETWORKING", name: "NETWORKING", icon: Network },
    { id: "CYBERSECURITY", name: "CYBERSECURITY", icon: ShieldAlert },
    { id: "WEBDEVELOPMENT", name: "WEB DEVELOPMENT", icon: Laptop },
    { id: "SOFTWAREENGINEERING", name: "SOFTWARE ENG.", icon: Gamepad2 },
    { id: "LINUX", name: "LINUX", icon: Terminal },
    { id: "CLOUD", name: "CLOUD", icon: Cloud },
    { id: "DATASCIENCE", name: "DATA SCIENCE", icon: BarChart }
];

interface CategorySelectorProps {
    onSelect: (categoryId: string) => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({ onSelect }) => {
    return (
        <div className="flex flex-col items-center max-w-4xl mx-auto w-full p-4">
            <h2 className="text-3xl md:text-4xl text-cyan-400 font-bold mb-8 neon-text-cyan tracking-widest text-center animate-pulse">
                SELECT CATEGORY
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
                {CATEGORIES.map((cat) => {
                    const IconComponent = cat.icon;
                    return (
                        <button
                            key={cat.id}
                            onClick={() => onSelect(cat.id)}
                            className="group flex flex-col items-center justify-center p-4 min-h-[100px]
                         bg-zinc-900/50 border border-cyan-500/30 rounded-lg backdrop-blur-sm
                         hover:bg-cyan-900/30 hover:border-cyan-400 hover:-translate-y-1 
                         transition-all duration-300 shadow-[0_0_10px_rgba(0,255,204,0.1)]
                         hover:shadow-[0_0_20px_rgba(0,255,204,0.4)] cursor-none"
                        >
                            <IconComponent className="w-8 h-8 mb-2 text-cyan-500 group-hover:text-cyan-300 transition-colors" />
                            <span className="text-sm font-semibold tracking-wider text-cyan-50 group-hover:text-white text-center">
                                {cat.name}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
