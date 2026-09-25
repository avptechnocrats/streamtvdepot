import { Film, Tv, Zap, Smile, Sword, Telescope } from "lucide-react";

const categories = [
  { name: "Action", icon: Zap, color: "from-red-500/20 to-orange-500/20" },
  { name: "Comedy", icon: Smile, color: "from-yellow-500/20 to-amber-500/20" },
  { name: "Drama", icon: Film, color: "from-blue-500/20 to-indigo-500/20" },
  { name: "Fantasy", icon: Sword, color: "from-purple-500/20 to-pink-500/20" },
  { name: "Sci-Fi", icon: Telescope, color: "from-cyan-500/20 to-teal-500/20" },
  { name: "TV Shows", icon: Tv, color: "from-emerald-500/20 to-green-500/20" },
];

const CategoryGrid = () => {
  return (
    <section className="px-6 lg:px-12 space-y-4">
      <h3 className="text-lg md:text-xl font-display font-700 text-foreground">
        Browse by Category
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.name}
              className={`flex flex-col items-center gap-3 p-5 rounded-xl bg-gradient-to-br ${cat.color} border border-border/50 hover:border-primary/30 transition-all hover:scale-105 cursor-pointer`}
            >
              <Icon size={28} className="text-foreground" />
              <span className="text-sm font-medium text-foreground">{cat.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default CategoryGrid;
