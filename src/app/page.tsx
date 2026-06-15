"use client";

import React, { useState, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  ExternalLink,
  Trash2,
  Edit3,
  Link2,
  Tag,
  TrendingDown,
  TrendingUp,
  Minus,
  Package,
  Globe,
  Code2,
  Search,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Settings2,
  LogIn,
  LogOut,
  Shield,
  FolderTree,
  FolderOpen,
  FolderPlus,
  Calculator,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────
interface PriceHistory {
  id: string;
  price: number;
  adjustedPrice: number;
  fetchedAt: string;
}

interface CompetitorLink {
  id: string;
  productId: string;
  name: string;
  url: string;
  linkType: string;
  priceSelector: string | null;
  priceMultiplier: number;
  lastPrice: number | null;
  lastAdjustedPrice: number | null;
  lastFetchedAt: string | null;
  priceHistory?: PriceHistory[];
}

interface ProductGroupParent {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  children: ProductGroup[];
  productCount?: number;
}

interface ProductGroup {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  parent?: { id: string; name: string } | null;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  groupId: string | null;
  group?: ProductGroup & { parent?: { id: string; name: string } | null } | null;
  createdAt: string;
  updatedAt: string;
  links: CompetitorLink[];
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatPrice(price: number, currencyUnit: string): string {
  return new Intl.NumberFormat("fa-IR").format(Math.round(price)) + " " + currencyUnit;
}

function getPriceTrend(history?: PriceHistory[]) {
  if (!history || history.length < 2) return null;
  const latest = history[0].adjustedPrice;
  const previous = history[1].adjustedPrice;
  if (latest < previous) return <TrendingDown className="w-4 h-4 text-emerald-500" />;
  if (latest > previous) return <TrendingUp className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

// ─── Main Component ───────────────────────────────────────────────
export default function CatalogPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<ProductGroupParent[]>([]);
  const [currencyUnit, setCurrencyUnit] = useState("تومان");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [fetchingPrices, setFetchingPrices] = useState<Set<string>>(new Set());

  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");

  // Dialog states
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkProductId, setLinkProductId] = useState<string>("");
  const [editingLink, setEditingLink] = useState<CompetitorLink | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "product" | "link" | "group";
    id: string;
    parentId?: string;
    name?: string;
  } | null>(null);

  // Settings dialog
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    currencyUnit: "تومان",
    adminPassword: "",
    currentPassword: "",
  });

  // Group dialog
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({
    name: "",
    parentId: "",
  });
  const [editingGroup, setEditingGroup] = useState<ProductGroupParent | null>(null);

  // Form states
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    imageUrl: "",
    groupId: "",
  });
  const [linkForm, setLinkForm] = useState({
    name: "",
    url: "",
    linkType: "WEBSITE",
    priceSelector: "",
    priceMultiplier: "1",
  });

  // ─── Fetch Data ────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setProducts(data);
    } catch {
      toast({ title: "خطا", description: "دریافت محصولات ناموفق بود", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setGroups(data);
    } catch {
      toast({ title: "خطا", description: "دریافت گروه‌ها ناموفق بود", variant: "destructive" });
    }
  }, [toast]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setCurrencyUnit(data.currencyUnit || "تومان");
      setSettingsForm((f) => ({ ...f, currencyUnit: data.currencyUnit || "تومان" }));
    } catch {
      // silently fail
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth");
      if (!res.ok) return;
      const data = await res.json();
      setIsAdmin(data.authenticated);
    } catch {
      // not authenticated
    }
  }, []);

  React.useEffect(() => {
    fetchProducts();
    fetchGroups();
    fetchSettings();
    checkAuth();
  }, [fetchProducts, fetchGroups, fetchSettings, checkAuth]);

  // ─── Build group filter options (flat list of main + sub) ──────
  const groupFilterOptions = React.useMemo(() => {
    const options: { id: string; name: string; depth: number; parentName?: string }[] = [];
    groups.forEach((g) => {
      options.push({ id: g.id, name: g.name, depth: 0 });
      g.children.forEach((sub) => {
        options.push({ id: sub.id, name: sub.name, depth: 1, parentName: g.name });
      });
    });
    return options;
  }, [groups]);

  // ─── Filter products ───────────────────────────────────────────
  const filteredProducts = React.useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesGroup =
        selectedGroup === "all" || p.groupId === selectedGroup;
      return matchesSearch && matchesGroup;
    });
  }, [products, searchQuery, selectedGroup]);

  // ─── Auth handlers ─────────────────────────────────────────────
  const handleLogin = async () => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "خطا", description: data.error || "ورود ناموفق بود", variant: "destructive" });
        return;
      }
      setIsAdmin(true);
      setLoginDialogOpen(false);
      setLoginPassword("");
      toast({ title: "ورود موفق", description: "به عنوان مدیر وارد شدید" });
    } catch {
      toast({ title: "خطا", description: "ورود ناموفق بود", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", { method: "DELETE" });
      setIsAdmin(false);
      toast({ title: "خروج", description: "از حساب مدیر خارج شدید" });
    } catch {
      // ignore
    }
  };

  // ─── Product CRUD ──────────────────────────────────────────────
  const handleSaveProduct = async () => {
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : "/api/products";
      const method = editingProduct ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name,
          description: productForm.description || null,
          price: parseFloat(productForm.price),
          imageUrl: productForm.imageUrl || null,
          groupId: productForm.groupId || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast({
        title: editingProduct ? "محصول بروزرسانی شد" : "محصول اضافه شد",
        description: productForm.name,
      });

      setProductDialogOpen(false);
      setEditingProduct(null);
      resetProductForm();
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "ذخیره محصول ناموفق بود", variant: "destructive" });
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "محصول حذف شد" });
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "حذف محصول ناموفق بود", variant: "destructive" });
    }
  };

  // ─── Link CRUD ─────────────────────────────────────────────────
  const handleSaveLink = async () => {
    try {
      const url = editingLink
        ? `/api/products/${linkProductId}/links/${editingLink.id}`
        : `/api/products/${linkProductId}/links`;
      const method = editingLink ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: linkForm.name,
          url: linkForm.url,
          linkType: linkForm.linkType,
          priceSelector: linkForm.priceSelector || null,
          priceMultiplier: parseFloat(linkForm.priceMultiplier) || 1.0,
        }),
      });

      if (!res.ok) throw new Error();

      toast({
        title: editingLink ? "لینک بروزرسانی شد" : "لینک رقیب اضافه شد",
        description: linkForm.name,
      });

      setLinkDialogOpen(false);
      setEditingLink(null);
      resetLinkForm();
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "ذخیره لینک ناموفق بود", variant: "destructive" });
    }
  };

  const handleDeleteLink = async (productId: string, linkId: string) => {
    try {
      const res = await fetch(`/api/products/${productId}/links/${linkId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "لینک حذف شد" });
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "حذف لینک ناموفق بود", variant: "destructive" });
    }
  };

  // ─── Fetch Prices ──────────────────────────────────────────────
  const handleFetchPrices = async (productId: string) => {
    setFetchingPrices((prev) => new Set(prev).add(productId));
    try {
      const res = await fetch(`/api/products/${productId}/fetch-prices`, { method: "POST" });
      if (!res.ok) throw new Error();

      const data = await res.json();
      const successCount = data.results.filter((r: { success: boolean }) => r.success).length;
      const failCount = data.results.filter((r: { success: boolean }) => !r.success).length;

      toast({
        title: "استخراج قیمت‌ها انجام شد",
        description: `${successCount} موفق${failCount > 0 ? `، ${failCount} ناموفق` : ""}`,
        variant: failCount > 0 && successCount === 0 ? "destructive" : "default",
      });

      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "استخراج قیمت‌ها ناموفق بود", variant: "destructive" });
    } finally {
      setFetchingPrices((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  // ─── Group CRUD ────────────────────────────────────────────────
  const handleSaveGroup = async () => {
    try {
      const url = editingGroup ? `/api/groups/${editingGroup.id}` : "/api/groups";
      const method = editingGroup ? "PUT" : "POST";

      const body: { name: string; parentId?: string | null; order?: number } = {
        name: groupForm.name,
      };
      if (!editingGroup) {
        body.parentId = groupForm.parentId || null;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error();

      toast({
        title: editingGroup ? "گروه بروزرسانی شد" : "گروه اضافه شد",
        description: groupForm.name,
      });

      setGroupDialogOpen(false);
      setEditingGroup(null);
      setGroupForm({ name: "", parentId: "" });
      fetchGroups();
      fetchProducts(); // refresh group relations
    } catch {
      toast({ title: "خطا", description: "ذخیره گروه ناموفق بود", variant: "destructive" });
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const res = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "گروه حذف شد" });
      fetchGroups();
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "حذف گروه ناموفق بود", variant: "destructive" });
    }
  };

  // ─── Settings ──────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    try {
      const body: { currencyUnit?: string; adminPassword?: string; currentPassword?: string } = {
        currencyUnit: settingsForm.currencyUnit,
      };
      if (settingsForm.adminPassword) {
        body.adminPassword = settingsForm.adminPassword;
        body.currentPassword = settingsForm.currentPassword;
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "خطا", description: data.error || "ذخیره تنظیمات ناموفق بود", variant: "destructive" });
        return;
      }

      setCurrencyUnit(data.currencyUnit);
      setSettingsDialogOpen(false);
      setSettingsForm((f) => ({ ...f, adminPassword: "", currentPassword: "" }));
      toast({ title: "تنظیمات ذخیره شد" });
    } catch {
      toast({ title: "خطا", description: "ذخیره تنظیمات ناموفق بود", variant: "destructive" });
    }
  };

  // ─── Form helpers ──────────────────────────────────────────────
  const resetProductForm = () => {
    setProductForm({ name: "", description: "", price: "", imageUrl: "", groupId: "" });
  };
  const resetLinkForm = () => {
    setLinkForm({ name: "", url: "", linkType: "WEBSITE", priceSelector: "", priceMultiplier: "1" });
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description || "",
      price: String(product.price),
      imageUrl: product.imageUrl || "",
      groupId: product.groupId || "",
    });
    setProductDialogOpen(true);
  };

  const openAddLink = (productId: string) => {
    setLinkProductId(productId);
    setEditingLink(null);
    resetLinkForm();
    setLinkDialogOpen(true);
  };

  const openEditLink = (productId: string, link: CompetitorLink) => {
    setLinkProductId(productId);
    setEditingLink(link);
    setLinkForm({
      name: link.name,
      url: link.url,
      linkType: link.linkType,
      priceSelector: link.priceSelector || "",
      priceMultiplier: String(parseFloat(link.priceMultiplier.toFixed(4))),
    });
    setLinkDialogOpen(true);
  };

  // ─── Computed ──────────────────────────────────────────────────
  const getBestCompetitorPrice = (product: Product) => {
    const prices = product.links
      .filter((l) => l.lastAdjustedPrice !== null)
      .map((l) => l.lastAdjustedPrice as number);
    if (prices.length === 0) return null;
    return Math.min(...prices);
  };

  const getGroupName = (product: Product) => {
    if (!product.group) return null;
    const parentName = product.group.parent?.name;
    if (parentName) return `${parentName} › ${product.group.name}`;
    return product.group.name;
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-slate-900/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">کاتالوگ دیجیتال</h1>
                <p className="text-xs text-muted-foreground">
                  مقایسه قیمت محصولات با رقبا
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Admin buttons */}
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      setEditingGroup(null);
                      setGroupForm({ name: "", parentId: "" });
                      setGroupDialogOpen(true);
                    }}
                  >
                    <FolderPlus className="w-4 h-4" />
                    گروه‌بندی
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      setSettingsForm((f) => ({ ...f, currencyUnit, adminPassword: "", currentPassword: "" }));
                      setSettingsDialogOpen(true);
                    }}
                  >
                    <Settings2 className="w-4 h-4" />
                    تنظیمات
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20"
                    onClick={() => {
                      setEditingProduct(null);
                      resetProductForm();
                      setProductDialogOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    افزودن محصول
                  </Button>
                </>
              )}

              {/* Auth button */}
              {isAdmin ? (
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                  خروج مدیر
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setLoginDialogOpen(true)}>
                  <LogIn className="w-4 h-4" />
                  ورود مدیر
                </Button>
              )}
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی محصول..."
                className="pr-10"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            {groupFilterOptions.length > 0 && (
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="دسته‌بندی" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه دسته‌ها</SelectItem>
                  {groupFilterOptions.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.depth === 0 ? g.name : `└ ${g.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <div className="h-48 bg-muted rounded-t-lg" />
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded w-3/4 mb-3" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6">
              <Package className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {products.length === 0 ? "هنوز محصولی اضافه نشده" : "محصولی یافت نشد"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              {products.length === 0
                ? "برای شروع، ابتدا به عنوان مدیر وارد شوید و سپس گروه‌ها و محصولات خود را اضافه کنید."
                : "فیلترهای خود را تغییر دهید یا عبارت جستجوی دیگری امتحان کنید."}
            </p>
            {products.length === 0 && !isAdmin && (
              <Button variant="outline" className="gap-2" onClick={() => setLoginDialogOpen(true)}>
                <LogIn className="w-4 h-4" />
                ورود مدیر
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product) => {
                const isExpanded = expandedProduct === product.id;
                const bestPrice = getBestCompetitorPrice(product);
                const isFetching = fetchingPrices.has(product.id);
                const hasLinks = product.links.length > 0;
                const groupName = getGroupName(product);

                return (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={isExpanded ? "sm:col-span-2 lg:col-span-3" : ""}
                  >
                    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 border-border/50 group">
                      {/* Product Image */}
                      {product.imageUrl && (
                        <div className="relative h-48 overflow-hidden bg-muted">
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          {groupName && (
                            <Badge className="absolute top-3 right-3 bg-white/90 dark:bg-slate-800/90 text-foreground backdrop-blur-sm">
                              <FolderTree className="w-3 h-3 ml-1" />
                              {groupName}
                            </Badge>
                          )}
                        </div>
                      )}

                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-lg text-foreground truncate">
                              {product.name}
                            </h3>
                            {product.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {product.description}
                              </p>
                            )}
                            {!product.imageUrl && groupName && (
                              <Badge className="mt-2" variant="secondary">
                                <FolderTree className="w-3 h-3 ml-1" />
                                {groupName}
                              </Badge>
                            )}
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1 mr-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditProduct(product)}>
                                <Edit3 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget({ type: "product", id: product.id, name: product.name })}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="pb-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-muted-foreground">قیمت شما:</span>
                            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                              {formatPrice(product.price, currencyUnit)}
                            </p>
                          </div>
                          {bestPrice !== null && (
                            <div className="text-left">
                              <span className="text-xs text-muted-foreground">ارزان‌ترین رقیب:</span>
                              <p className="text-lg font-semibold text-foreground">
                                {formatPrice(bestPrice, currencyUnit)}
                              </p>
                              {bestPrice > product.price ? (
                                <Badge variant="default" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                                  شما ارزان‌تر!
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  رقیب ارزان‌تر
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>

                        {hasLinks && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                            <Link2 className="w-4 h-4" />
                            <span>{product.links.length} لینک رقیب</span>
                            <span className="text-xs">
                              ({product.links.filter((l) => l.lastAdjustedPrice !== null).length} قیمت استخراج شده)
                            </span>
                          </div>
                        )}
                      </CardContent>

                      <CardFooter className="flex flex-col items-stretch gap-3 pt-2">
                        <div className="flex gap-2">
                          {isAdmin && (
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => openAddLink(product.id)}>
                              <Plus className="w-3 h-3" />
                              لینک رقیب
                            </Button>
                          )}
                          {hasLinks && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => handleFetchPrices(product.id)}
                                disabled={isFetching}
                              >
                                {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                استخراج قیمت
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </Button>
                            </>
                          )}
                        </div>

                        {/* Expanded Competitor Prices */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              <Separator className="mb-3" />
                              <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                                {product.links.map((link) => (
                                  <div
                                    key={link.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                  >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <div
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                          link.linkType === "API"
                                            ? "bg-amber-100 dark:bg-amber-900/30"
                                            : "bg-sky-100 dark:bg-sky-900/30"
                                        }`}
                                      >
                                        {link.linkType === "API" ? (
                                          <Code2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                        ) : (
                                          <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{link.name}</p>
                                        <a
                                          href={link.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-muted-foreground hover:text-primary truncate block max-w-48"
                                        >
                                          {link.url}
                                          <ExternalLink className="w-2.5 h-2.5 inline mr-1" />
                                        </a>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="text-left">
                                        {link.lastAdjustedPrice !== null ? (
                                          <>
                                            <p className="text-sm font-bold">
                                              {formatPrice(link.lastAdjustedPrice, currencyUnit)}
                                            </p>
                                            {link.priceMultiplier !== 1 && link.lastPrice !== null && (
                                              <HoverCard>
                                                <HoverCardTrigger asChild>
                                                  <p className="text-[10px] text-muted-foreground cursor-help flex items-center gap-0.5">
                                                    <Calculator className="w-2.5 h-2.5" />
                                                    {formatPrice(link.lastPrice, currencyUnit)} × {parseFloat(link.priceMultiplier.toFixed(4))}
                                                  </p>
                                                </HoverCardTrigger>
                                                <HoverCardContent side="left" className="w-64 text-xs" dir="rtl">
                                                  <div className="space-y-1">
                                                    <p className="font-semibold">محاسبه قیمت با ضریب</p>
                                                    <p>قیمت استخراج‌شده: {formatPrice(link.lastPrice, currencyUnit)}</p>
                                                    <p>ضریب: {parseFloat(link.priceMultiplier.toFixed(4))}</p>
                                                    <Separator />
                                                    <p className="font-semibold">قیمت نهایی: {formatPrice(link.lastAdjustedPrice, currencyUnit)}</p>
                                                  </div>
                                                </HoverCardContent>
                                              </HoverCard>
                                            )}
                                            {link.lastFetchedAt && (
                                              <p className="text-[10px] text-muted-foreground">
                                                {new Date(link.lastFetchedAt).toLocaleDateString("fa-IR")}
                                              </p>
                                            )}
                                          </>
                                        ) : (
                                          <p className="text-xs text-muted-foreground">قیمت استخراج نشده</p>
                                        )}
                                      </div>
                                      {getPriceTrend(link.priceHistory)}
                                      {isAdmin && (
                                        <div className="flex gap-1">
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditLink(product.id, link)}>
                                            <Edit3 className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                            onClick={() => setDeleteTarget({ type: "link", id: link.id, parentId: product.id })}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </CardFooter>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            کاتالوگ دیجیتال — مقایسه هوشمند قیمت با رقبا
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {products.length} محصول • {products.reduce((sum, p) => sum + p.links.length, 0)} لینک رقیب
            {isAdmin && <span className="text-emerald-600"> • مدیر</span>}
          </p>
        </div>
      </footer>

      {/* ═══ Dialogs ═══ */}

      {/* Login Dialog */}
      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              ورود مدیر سیستم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="password">رمز عبور</Label>
              <Input
                id="password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="رمز عبور مدیر را وارد کنید"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <p className="text-xs text-muted-foreground">
                رمز عبور پیش‌فرض: admin123
              </p>
            </div>
            <Button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
              disabled={!loginPassword}
            >
              ورود
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Dialog */}
      <Dialog
        open={productDialogOpen}
        onOpenChange={(open) => {
          setProductDialogOpen(open);
          if (!open) {
            setEditingProduct(null);
            resetProductForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "ویرایش محصول" : "افزودن محصول جدید"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>نام محصول *</Label>
              <Input
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثلاً: گوشی موبایل سامسونگ"
              />
            </div>
            <div className="space-y-2">
              <Label>قیمت ({currencyUnit}) *</Label>
              <Input
                type="number"
                value={productForm.price}
                onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="مثلاً: 25000000"
              />
            </div>
            <div className="space-y-2">
              <Label>توضیحات</Label>
              <Textarea
                value={productForm.description}
                onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="توضیحات محصول..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>آدرس تصویر</Label>
              <Input
                value={productForm.imageUrl}
                onChange={(e) => setProductForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://example.com/image.jpg"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>گروه / دسته‌بندی</Label>
              <Select value={productForm.groupId || "__none__"} onValueChange={(v) => setProductForm((f) => ({ ...f, groupId: v === "__none__" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="بدون گروه" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون گروه</SelectItem>
                  {groups.map((g) => (
                    <React.Fragment key={g.id}>
                      <SelectItem value={g.id}>
                        <span className="font-medium">{g.name}</span>
                      </SelectItem>
                      {g.children.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          <span className="text-muted-foreground">└ {sub.name}</span>
                        </SelectItem>
                      ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSaveProduct}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
              disabled={!productForm.name || !productForm.price}
            >
              {editingProduct ? "بروزرسانی" : "افزودن محصول"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Dialog */}
      <Dialog
        open={linkDialogOpen}
        onOpenChange={(open) => {
          setLinkDialogOpen(open);
          if (!open) {
            setEditingLink(null);
            resetLinkForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingLink ? "ویرایش لینک رقیب" : "افزودن لینک رقیب"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>نام رقیب / منبع *</Label>
              <Input
                value={linkForm.name}
                onChange={(e) => setLinkForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثلاً: دیجی‌کالا، تکنولایف"
              />
            </div>
            <div className="space-y-2">
              <Label>آدرس لینک *</Label>
              <Input
                value={linkForm.url}
                onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://example.com/product/123"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>نوع لینک</Label>
              <Select value={linkForm.linkType} onValueChange={(val) => setLinkForm((f) => ({ ...f, linkType: val }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEBSITE">
                    <span className="flex items-center gap-2"><Globe className="w-4 h-4" />وب‌سایت</span>
                  </SelectItem>
                  <SelectItem value="API">
                    <span className="flex items-center gap-2"><Code2 className="w-4 h-4" />API</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                {linkForm.linkType === "API" ? "مسیر JSON (مثلاً: data.price)" : "انتخابگر CSS (اختیاری)"}
              </Label>
              <Input
                value={linkForm.priceSelector}
                onChange={(e) => setLinkForm((f) => ({ ...f, priceSelector: e.target.value }))}
                placeholder={linkForm.linkType === "API" ? "data.price" : ".product-price"}
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                {linkForm.linkType === "API"
                  ? "مسیر فیلد قیمت در پاسخ JSON. این فیلد الزامی است."
                  : "اگر وارد نکنید، از هوش مصنوعی برای استخراج استفاده می‌شود."}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                ضریب قیمت
              </Label>
              <Input
                type="number"
                step="0.01"
                value={linkForm.priceMultiplier}
                onChange={(e) => setLinkForm((f) => ({ ...f, priceMultiplier: e.target.value }))}
                placeholder="1"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                قیمت نهایی = قیمت استخراج‌شده × ضریب. مثلاً اگر ضریب ۱.۱ باشد، ۱۰٪ به قیمت اضافه می‌شود.
              </p>
            </div>
            <Button
              onClick={handleSaveLink}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
              disabled={!linkForm.name || !linkForm.url}
            >
              {editingLink ? "بروزرسانی لینک" : "افزودن لینک رقیب"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Dialog */}
      <Dialog
        open={groupDialogOpen}
        onOpenChange={(open) => {
          setGroupDialogOpen(open);
          if (!open) {
            setEditingGroup(null);
            setGroupForm({ name: "", parentId: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderTree className="w-5 h-5" />
              {editingGroup ? "ویرایش گروه" : "مدیریت گروه‌ها"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Add new group form */}
            {!editingGroup && (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <p className="text-sm font-medium">افزودن گروه جدید</p>
                <div className="space-y-2">
                  <Label>نام گروه *</Label>
                  <Input
                    value={groupForm.name}
                    onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="مثلاً: موبایل، لپ‌تاپ"
                  />
                </div>
                <div className="space-y-2">
                  <Label>گروه والد (برای زیرگروه)</Label>
                  <Select value={groupForm.parentId || "__none__"} onValueChange={(v) => setGroupForm((f) => ({ ...f, parentId: v === "__none__" ? "" : v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="گروه اصلی (بدون والد)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">گروه اصلی (بدون والد)</SelectItem>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleSaveGroup}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                  disabled={!groupForm.name}
                >
                  <FolderPlus className="w-4 h-4 ml-2" />
                  افزودن {groupForm.parentId ? "زیرگروه" : "گروه اصلی"}
                </Button>
              </div>
            )}

            {/* Edit group name */}
            {editingGroup && (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <p className="text-sm font-medium">ویرایش: {editingGroup.name}</p>
                <Input
                  value={groupForm.name}
                  onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="نام گروه"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveGroup}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
                    disabled={!groupForm.name}
                  >
                    بروزرسانی
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingGroup(null);
                      setGroupForm({ name: "", parentId: "" });
                    }}
                  >
                    انصراف
                  </Button>
                </div>
              </div>
            )}

            {/* Existing groups tree */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">گروه‌های موجود</p>
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">هنوز گروهی ایجاد نشده</p>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {groups.map((group) => (
                    <AccordionItem key={group.id} value={group.id}>
                      <AccordionTrigger className="hover:no-underline py-2">
                        <div className="flex items-center gap-2 flex-1">
                          <FolderOpen className="w-4 h-4 text-emerald-600" />
                          <span className="font-medium text-sm">{group.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {group.children.length} زیرگروه
                          </Badge>
                        </div>
                        <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingGroup(group);
                              setGroupForm({ name: group.name, parentId: "" });
                            }}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setDeleteTarget({ type: "group", id: group.id, name: group.name })}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {group.children.length === 0 ? (
                          <p className="text-xs text-muted-foreground pr-8 py-1">زیرگروهی ندارد</p>
                        ) : (
                          <div className="space-y-1 pr-6">
                            {group.children.map((sub) => (
                              <div key={sub.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted">
                                <div className="flex items-center gap-2">
                                  <FolderTree className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-sm">{sub.name}</span>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => {
                                      setEditingGroup(sub as unknown as ProductGroupParent);
                                      setGroupForm({ name: sub.name, parentId: group.id });
                                    }}
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive"
                                    onClick={() => setDeleteTarget({ type: "group", id: sub.id, name: sub.name })}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              تنظیمات سیستم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>واحد پول</Label>
              <Select value={settingsForm.currencyUnit} onValueChange={(v) => setSettingsForm((f) => ({ ...f, currencyUnit: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="تومان">تومان</SelectItem>
                  <SelectItem value="ریال">ریال</SelectItem>
                  <SelectItem value="دلار">$ دلار</SelectItem>
                  <SelectItem value="یورو">€ یورو</SelectItem>
                  <SelectItem value="درهم">درهم</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium">تغییر رمز عبور</p>
              <div className="space-y-2">
                <Label>رمز عبور فعلی</Label>
                <Input
                  type="password"
                  value={settingsForm.currentPassword}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  placeholder="رمز فعلی را وارد کنید"
                />
              </div>
              <div className="space-y-2">
                <Label>رمز عبور جدید</Label>
                <Input
                  type="password"
                  value={settingsForm.adminPassword}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, adminPassword: e.target.value }))}
                  placeholder="رمز جدید را وارد کنید"
                />
              </div>
              <p className="text-xs text-muted-foreground">اگر نمی‌خواهید رمز را تغییر دهید، این بخش را خالی بگذارید.</p>
            </div>
            <Button
              onClick={handleSaveSettings}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
            >
              ذخیره تنظیمات
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>آیا مطمئن هستید؟</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "product"
                ? `محصول "${deleteTarget.name}" همراه با تمام لینک‌ها و تاریخچه قیمت‌ها حذف خواهد شد.`
                : deleteTarget?.type === "group"
                ? `گروه "${deleteTarget.name}" همراه با زیرگروه‌ها حذف خواهد شد. محصولات این گروه بدون گروه می‌شوند.`
                : "این لینک رقیب همراه با تاریخچه قیمت‌ها حذف خواهد شد."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  if (deleteTarget.type === "product") handleDeleteProduct(deleteTarget.id);
                  else if (deleteTarget.type === "link" && deleteTarget.parentId) handleDeleteLink(deleteTarget.parentId, deleteTarget.id);
                  else if (deleteTarget.type === "group") handleDeleteGroup(deleteTarget.id);
                }
                setDeleteTarget(null);
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
