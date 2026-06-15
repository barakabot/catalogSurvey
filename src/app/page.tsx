"use client";

import React, { useState, useCallback } from "react";
import {
  Plus,
  ExternalLink,
  Trash2,
  Edit3,
  Search,
  X,
  Loader2,
  RefreshCw,
  Settings2,
  LogIn,
  LogOut,
  Shield,
  FolderTree,
  FolderOpen,
  FolderPlus,
  Eye,
  Link2,
  Unlink,
  Globe,
  ShoppingCart,
  Tag,
  Package,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────
interface CompetitorPriceHistory {
  id: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number;
  fetchedAt: string;
}

interface CompetitorProduct {
  id: string;
  source: string;
  sourceId: string;
  name: string;
  imageUrl: string | null;
  weight: string | null;
  volume: string | null;
  price: number;
  originalPrice: number | null;
  discountPercent: number;
  brand: string | null;
  fetchedAt: string;
  catalogProductId: string | null;
  priceHistory?: CompetitorPriceHistory[];
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
  competitorProducts?: CompetitorProduct[];
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatPrice(price: number, currencyUnit: string): string {
  return new Intl.NumberFormat("fa-IR").format(Math.round(price)) + " " + currencyUnit;
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

  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");

  // Dialog states
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "product" | "group" | "competitor";
    id: string;
    name?: string;
  } | null>(null);

  // Product detail modal
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailCompetitors, setDetailCompetitors] = useState<CompetitorProduct[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshingCompetitor, setRefreshingCompetitor] = useState<string | null>(null);

  // Add competitor dialog
  const [addCompetitorDialogOpen, setAddCompetitorDialogOpen] = useState(false);
  const [competitorSource, setCompetitorSource] = useState<string>("");
  const [competitorSourceId, setCompetitorSourceId] = useState<string>("");
  const [competitorLinkProductId, setCompetitorLinkProductId] = useState<string>("");
  const [scrapeLoading, setScrapeLoading] = useState(false);

  // Link competitor dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkingCompetitor, setLinkingCompetitor] = useState<CompetitorProduct | null>(null);
  const [linkProductId, setLinkProductId] = useState<string>("");

  // All competitors (unlinked) for management
  const [allCompetitors, setAllCompetitors] = useState<CompetitorProduct[]>([]);
  const [competitorManageOpen, setCompetitorManageOpen] = useState(false);
  const [competitorFilter, setCompetitorFilter] = useState<string>("all");

  // Settings dialog
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    currencyUnit: "تومان",
    adminPassword: "",
    currentPassword: "",
  });

  // Group dialog
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", parentId: "" });
  const [editingGroup, setEditingGroup] = useState<ProductGroupParent | null>(null);

  // Form states
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    imageUrl: "",
    groupId: "",
  });

  // ─── Fetch Data ────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error();
      setProducts(await res.json());
    } catch {
      toast({ title: "خطا", description: "دریافت محصولات ناموفق بود", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      if (!res.ok) throw new Error();
      setGroups(await res.json());
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
    } catch {}
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth");
      if (!res.ok) return;
      setIsAdmin((await res.json()).authenticated);
    } catch {}
  }, []);

  React.useEffect(() => {
    fetchProducts();
    fetchGroups();
    fetchSettings();
    checkAuth();
  }, [fetchProducts, fetchGroups, fetchSettings, checkAuth]);

  // ─── Group filter options ──────────────────────────────────────
  const groupFilterOptions = React.useMemo(() => {
    const opts: { id: string; name: string; depth: number }[] = [];
    groups.forEach((g) => {
      opts.push({ id: g.id, name: g.name, depth: 0 });
      g.children.forEach((sub) => opts.push({ id: sub.id, name: sub.name, depth: 1 }));
    });
    return opts;
  }, [groups]);

  // ─── Filter products ───────────────────────────────────────────
  const filteredProducts = React.useMemo(() => {
    return products.filter((p) => {
      const mq = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.description?.toLowerCase().includes(searchQuery.toLowerCase()));
      const mg = selectedGroup === "all" || p.groupId === selectedGroup;
      return mq && mg;
    });
  }, [products, searchQuery, selectedGroup]);

  // ─── Auth ──────────────────────────────────────────────────────
  const handleLogin = async () => {
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: loginPassword }) });
      const data = await res.json();
      if (!res.ok) { toast({ title: "خطا", description: data.error || "ورود ناموفق بود", variant: "destructive" }); return; }
      setIsAdmin(true);
      setLoginDialogOpen(false);
      setLoginPassword("");
      toast({ title: "ورود موفق", description: "به عنوان مدیر وارد شدید" });
    } catch { toast({ title: "خطا", description: "ورود ناموفق بود", variant: "destructive" }); }
  };

  const handleLogout = async () => {
    try { await fetch("/api/auth", { method: "DELETE" }); setIsAdmin(false); toast({ title: "خروج" }); } catch {}
  };

  // ─── Product CRUD ──────────────────────────────────────────────
  const handleSaveProduct = async () => {
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : "/api/products";
      const res = await fetch(url, { method: editingProduct ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: productForm.name, description: productForm.description || null, price: parseFloat(productForm.price), imageUrl: productForm.imageUrl || null, groupId: productForm.groupId || null }) });
      if (!res.ok) throw new Error();
      toast({ title: editingProduct ? "محصول بروزرسانی شد" : "محصول اضافه شد" });
      setProductDialogOpen(false);
      setEditingProduct(null);
      resetProductForm();
      fetchProducts();
    } catch { toast({ title: "خطا", description: "ذخیره محصول ناموفق بود", variant: "destructive" }); }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      if (!(await fetch(`/api/products/${id}`, { method: "DELETE" })).ok) throw new Error();
      toast({ title: "محصول حذف شد" }); fetchProducts();
    } catch { toast({ title: "خطا", description: "حذف ناموفق بود", variant: "destructive" }); }
  };

  // ─── Product Detail ────────────────────────────────────────────
  const openProductDetail = async (product: Product) => {
    setDetailProduct(product);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/competitors?catalogProductId=${product.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailCompetitors(data.competitors || []);
      } else {
        setDetailCompetitors([]);
      }
    } catch {
      setDetailCompetitors([]);
    }
    setLoadingDetail(false);
  };

  const handleRefreshCompetitor = async (competitorId: string) => {
    setRefreshingCompetitor(competitorId);
    try {
      const res = await fetch(`/api/competitors/${competitorId}/refresh`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "خطا", description: data.error || "بروزرسانی ناموفق بود", variant: "destructive" });
      } else {
        toast({ title: "بروزرسانی شد", description: data.priceChanged ? "قیمت تغییر کرد" : "قیمت بدون تغییر" });
        // Refresh the list
        if (detailProduct) {
          const refreshRes = await fetch(`/api/competitors?catalogProductId=${detailProduct.id}`);
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            setDetailCompetitors(refreshData.competitors || []);
          }
        }
        fetchProducts();
      }
    } catch {
      toast({ title: "خطا", description: "بروزرسانی ناموفق بود", variant: "destructive" });
    } finally {
      setRefreshingCompetitor(null);
    }
  };

  const handleRefreshAllCompetitors = async () => {
    if (!detailProduct) return;
    setRefreshingCompetitor("all");
    try {
      let successCount = 0;
      for (const comp of detailCompetitors) {
        const res = await fetch(`/api/competitors/${comp.id}/refresh`, { method: "POST" });
        if (res.ok) successCount++;
      }
      toast({ title: "بروزرسانی انجام شد", description: `${successCount} از ${detailCompetitors.length} موفق` });
      // Refresh the list
      const refreshRes = await fetch(`/api/competitors?catalogProductId=${detailProduct.id}`);
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setDetailCompetitors(refreshData.competitors || []);
      }
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "بروزرسانی ناموفق بود", variant: "destructive" });
    } finally {
      setRefreshingCompetitor(null);
    }
  };

  // ─── Competitor CRUD ──────────────────────────────────────────
  const handleScrapeAndAdd = async () => {
    if (!competitorSource || !competitorSourceId) {
      toast({ title: "خطا", description: "منبع و شناسه محصول الزامی است", variant: "destructive" });
      return;
    }
    setScrapeLoading(true);
    try {
      const body: Record<string, string> = {
        source: competitorSource,
        sourceId: competitorSourceId,
      };
      if (competitorLinkProductId) body.catalogProductId = competitorLinkProductId;

      const res = await fetch("/api/competitors/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "خطا در اسکرپ", description: data.error || "خطای ناشناخته", variant: "destructive", duration: 6000 });
        return;
      }
      toast({
        title: data.action === "created" ? "محصول رقیب اضافه شد" : "محصول رقیب بروزرسانی شد",
        description: `${data.data?.name} — ${data.data?.price ? formatPrice(data.data.price, currencyUnit) : ""}`,
      });
      setAddCompetitorDialogOpen(false);
      setCompetitorSource("");
      setCompetitorSourceId("");
      setCompetitorLinkProductId("");
      // Refresh detail if open
      if (detailProduct) {
        const refreshRes = await fetch(`/api/competitors?catalogProductId=${detailProduct.id}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setDetailCompetitors(refreshData.competitors || []);
        }
      }
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "اسکرپ محصول ناموفق بود", variant: "destructive" });
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleDeleteCompetitor = async (id: string) => {
    try {
      const res = await fetch(`/api/competitors?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "محصول رقیب حذف شد" });
      if (detailProduct) {
        setDetailCompetitors((prev) => prev.filter((c) => c.id !== id));
      }
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "حذف ناموفق بود", variant: "destructive" });
    }
  };

  const handleLinkCompetitor = async () => {
    if (!linkingCompetitor || !linkProductId) return;
    try {
      const res = await fetch(`/api/competitors/${linkingCompetitor.id}/link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogProductId: linkProductId }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "محصول رقیب به کاتالوگ متصل شد" });
      setLinkDialogOpen(false);
      setLinkingCompetitor(null);
      setLinkProductId("");
      // Refresh
      if (detailProduct) openProductDetail(detailProduct);
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "اتصال ناموفق بود", variant: "destructive" });
    }
  };

  const handleUnlinkCompetitor = async (competitorId: string) => {
    try {
      const res = await fetch(`/api/competitors/${competitorId}/unlink`, { method: "PUT" });
      if (!res.ok) throw new Error();
      toast({ title: "اتصال لغو شد" });
      if (detailProduct) {
        setDetailCompetitors((prev) => prev.filter((c) => c.id !== competitorId));
      }
      fetchProducts();
    } catch {
      toast({ title: "خطا", description: "لغو اتصال ناموفق بود", variant: "destructive" });
    }
  };

  const fetchAllCompetitors = async () => {
    try {
      const filterParam = competitorFilter === "unlinked" ? "&unlinked=true" : competitorFilter !== "all" ? `&source=${competitorFilter}` : "";
      const res = await fetch(`/api/competitors?${filterParam}`);
      if (res.ok) {
        const data = await res.json();
        setAllCompetitors(data.competitors || []);
      }
    } catch {}
  };

  // ─── Group CRUD ────────────────────────────────────────────────
  const handleSaveGroup = async () => {
    try {
      const url = editingGroup ? `/api/groups/${editingGroup.id}` : "/api/groups";
      const body: Record<string, unknown> = { name: groupForm.name };
      if (!editingGroup) body.parentId = groupForm.parentId || null;
      if (!(await fetch(url, { method: editingGroup ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).ok) throw new Error();
      toast({ title: editingGroup ? "گروه بروزرسانی شد" : "گروه اضافه شد" });
      setGroupDialogOpen(false); setEditingGroup(null); setGroupForm({ name: "", parentId: "" });
      fetchGroups(); fetchProducts();
    } catch { toast({ title: "خطا", description: "ذخیره گروه ناموفق بود", variant: "destructive" }); }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      if (!(await fetch(`/api/groups/${id}`, { method: "DELETE" })).ok) throw new Error();
      toast({ title: "گروه حذف شد" }); fetchGroups(); fetchProducts();
    } catch { toast({ title: "خطا", description: "حذف ناموفق بود", variant: "destructive" }); }
  };

  // ─── Settings ──────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    try {
      const body: Record<string, string> = { currencyUnit: settingsForm.currencyUnit };
      if (settingsForm.adminPassword) { body.adminPassword = settingsForm.adminPassword; body.currentPassword = settingsForm.currentPassword; }
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast({ title: "خطا", description: data.error || "ذخیره ناموفق بود", variant: "destructive" }); return; }
      setCurrencyUnit(data.currencyUnit);
      setSettingsDialogOpen(false);
      setSettingsForm((f) => ({ ...f, adminPassword: "", currentPassword: "" }));
      toast({ title: "تنظیمات ذخیره شد" });
    } catch { toast({ title: "خطا", description: "ذخیره ناموفق بود", variant: "destructive" }); }
  };

  // ─── Form helpers ──────────────────────────────────────────────
  const resetProductForm = () => setProductForm({ name: "", description: "", price: "", imageUrl: "", groupId: "" });

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({ name: product.name, description: product.description || "", price: String(product.price), imageUrl: product.imageUrl || "", groupId: product.groupId || "" });
    setProductDialogOpen(true);
  };

  // ─── Computed ──────────────────────────────────────────────────
  const getBestCompetitorPrice = (product: Product) => {
    // This needs competitor data loaded
    const prices = (product.competitorProducts || []).filter((c) => c.price > 0).map((c) => c.price);
    return prices.length ? Math.min(...prices) : null;
  };

  const getGroupName = (product: Product) => {
    if (!product.group) return null;
    return product.group.parent?.name ? `${product.group.parent.name} › ${product.group.name}` : product.group.name;
  };

  const getSourceIcon = (source: string) => {
    if (source === "DIGIKALA") return "🟡";
    if (source === "SNAPPSHOP") return "🟣";
    return "⚪";
  };

  const getSourceLabel = (source: string) => {
    if (source === "DIGIKALA") return "دیجیکالا";
    if (source === "SNAPPSHOP") return "اسنپ‌شاپ";
    return source;
  };

  const getSourceUrl = (source: string, sourceId: string) => {
    if (source === "DIGIKALA") return `https://www.digikala.com/product/dkp-${sourceId}`;
    if (source === "SNAPPSHOP") return `https://snappshop.ir/product/snp-${sourceId}`;
    return "#";
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
                <p className="text-xs text-muted-foreground">مقایسه قیمت محصولات با رقبا</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin && (
                <>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => { setEditingGroup(null); setGroupForm({ name: "", parentId: "" }); setGroupDialogOpen(true); }}>
                    <FolderPlus className="w-4 h-4" /> گروه‌بندی
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => { setCompetitorManageOpen(true); fetchAllCompetitors(); }}>
                    <ShoppingCart className="w-4 h-4" /> رقبای اسکرپ شده
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => { setSettingsForm((f) => ({ ...f, currencyUnit, adminPassword: "", currentPassword: "" })); setSettingsDialogOpen(true); }}>
                    <Settings2 className="w-4 h-4" /> تنظیمات
                  </Button>
                  <Button variant="default" size="sm" className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20" onClick={() => { setEditingProduct(null); resetProductForm(); setProductDialogOpen(true); }}>
                    <Plus className="w-4 h-4" /> افزودن محصول
                  </Button>
                </>
              )}
              {isAdmin ? (
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout}><LogOut className="w-4 h-4" /> خروج مدیر</Button>
              ) : (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setLoginDialogOpen(true)}><LogIn className="w-4 h-4" /> ورود مدیر</Button>
              )}
            </div>
          </div>
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="جستجوی محصول..." className="pr-10" />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute left-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-muted-foreground hover:text-foreground" /></button>}
            </div>
            {groupFilterOptions.length > 0 && (
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="دسته‌بندی" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه دسته‌ها</SelectItem>
                  {groupFilterOptions.map((g) => <SelectItem key={g.id} value={g.id}>{g.depth === 0 ? g.name : `└ ${g.name}`}</SelectItem>)}
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
            {[1, 2, 3].map((i) => <Card key={i} className="animate-pulse"><div className="h-48 bg-muted rounded-t-lg" /><CardContent className="p-6"><div className="h-4 bg-muted rounded w-3/4 mb-3" /><div className="h-4 bg-muted rounded w-1/2" /></CardContent></Card>)}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-6"><Package className="w-12 h-12 text-muted-foreground" /></div>
            <h3 className="text-lg font-semibold text-foreground mb-2">{products.length === 0 ? "هنوز محصولی اضافه نشده" : "محصولی یافت نشد"}</h3>
            <p className="text-muted-foreground mb-6 max-w-md">{products.length === 0 ? "برای شروع، ابتدا به عنوان مدیر وارد شوید." : "فیلترهای خود را تغییر دهید."}</p>
            {products.length === 0 && !isAdmin && <Button variant="outline" className="gap-2" onClick={() => setLoginDialogOpen(true)}><LogIn className="w-4 h-4" /> ورود مدیر</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product) => {
                const groupName = getGroupName(product);
                return (
                  <motion.div key={product.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 border-border/50 group cursor-pointer" onClick={() => openProductDetail(product)}>
                      {product.imageUrl && (
                        <div className="relative h-48 overflow-hidden bg-muted">
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          {groupName && <Badge className="absolute top-3 right-3 bg-white/90 dark:bg-slate-800/90 text-foreground backdrop-blur-sm"><FolderTree className="w-3 h-3 ml-1" />{groupName}</Badge>}
                        </div>
                      )}
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-base leading-snug text-foreground line-clamp-2" title={product.name}>{product.name}</h3>
                            {product.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{product.description}</p>}
                            {!product.imageUrl && groupName && <Badge className="mt-2" variant="secondary"><FolderTree className="w-3 h-3 ml-1" />{groupName}</Badge>}
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1 mr-2" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditProduct(product)}><Edit3 className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "product", id: product.id, name: product.name })}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div>
                          <span className="text-xs text-muted-foreground">قیمت شما:</span>
                          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatPrice(product.price, currencyUnit)}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground/60">
                          <Eye className="w-3 h-3" />
                          <span>برای مشاهده رقبا کلیک کنید</span>
                        </div>
                      </CardContent>
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
          <p className="text-sm text-muted-foreground">کاتالوگ دیجیتال — مقایسه هوشمند قیمت با رقبا</p>
          <p className="text-xs text-muted-foreground mt-1">{products.length} محصول{isAdmin && <span className="text-emerald-600"> • مدیر</span>}</p>
        </div>
      </footer>

      {/* ═══ Product Detail Modal ═══ */}
      <Dialog open={!!detailProduct} onOpenChange={(open) => { if (!open) setDetailProduct(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          {detailProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Package className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="line-clamp-2">{detailProduct.name}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5 mt-4">
                {/* Product Info */}
                <div className="flex items-start gap-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  {detailProduct.imageUrl && <img src={detailProduct.imageUrl} alt={detailProduct.name} className="w-20 h-20 rounded-lg object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">قیمت شما:</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatPrice(detailProduct.price, currencyUnit)}</p>
                    {detailProduct.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{detailProduct.description}</p>}
                    {(() => { const gn = getGroupName(detailProduct); return gn ? <Badge className="mt-2" variant="secondary"><FolderTree className="w-3 h-3 ml-1" />{gn}</Badge> : null; })()}
                  </div>
                </div>

                {/* Competitor Products */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2"><Link2 className="w-4 h-4" /> قیمت رقبا</h3>
                    <div className="flex gap-2">
                      {detailCompetitors.length > 0 && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={handleRefreshAllCompetitors} disabled={refreshingCompetitor === "all"}>
                          {refreshingCompetitor === "all" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          بروزرسانی همه
                        </Button>
                      )}
                      {isAdmin && (
                        <Button variant="default" size="sm" className="gap-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white" onClick={() => { setCompetitorLinkProductId(detailProduct.id); setAddCompetitorDialogOpen(true); }}>
                          <Plus className="w-3 h-3" /> افزودن رقیب
                        </Button>
                      )}
                    </div>
                  </div>

                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /><span className="mr-2 text-muted-foreground">در حال بارگذاری...</span></div>
                  ) : detailCompetitors.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">هنوز رقیبی برای این محصول ثبت نشده</p>
                      {isAdmin && <p className="text-xs mt-1">از دکمه «افزودن رقیب» محصولی از دیجیکالا یا اسنپ‌شاپ اضافه کنید</p>}
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {detailCompetitors.map((comp) => {
                        const isCheaper = comp.price > 0 && comp.price < detailProduct.price;
                        const isMoreExpensive = comp.price > 0 && comp.price > detailProduct.price;
                        return (
                          <div key={comp.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${isCheaper ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800" : isMoreExpensive ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800" : "bg-muted/50 border-border"}`}>
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="relative shrink-0">
                                {comp.imageUrl ? (
                                  <img src={comp.imageUrl} alt={comp.name} className="w-12 h-12 rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-lg">
                                    {getSourceIcon(comp.source)}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{getSourceLabel(comp.source)}</Badge>
                                  {comp.brand && <span className="text-[10px] text-muted-foreground">{comp.brand}</span>}
                                </div>
                                <p className="font-medium line-clamp-1 text-sm">{comp.name}</p>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  {(comp.weight || comp.volume) && <span>{comp.weight || comp.volume}</span>}
                                  <a href={getSourceUrl(comp.source, comp.sourceId)} target="_blank" rel="noopener noreferrer" className="hover:text-primary inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                    مشاهده <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-left">
                                {comp.price > 0 ? (
                                  <>
                                    <p className="font-bold text-base">{formatPrice(comp.price, currencyUnit)}</p>
                                    {comp.discountPercent > 0 && comp.originalPrice && (
                                      <div className="flex items-center gap-1">
                                        <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                          <Tag className="w-2.5 h-2.5 ml-0.5" />
                                          {comp.discountPercent}%
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground line-through">{formatPrice(comp.originalPrice, currencyUnit)}</span>
                                      </div>
                                    )}
                                    {isCheaper && <Badge variant="destructive" className="text-[10px] mt-1">رقیب ارزان‌تر</Badge>}
                                    {isMoreExpensive && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] mt-1">شما ارزان‌تر!</Badge>}
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(comp.fetchedAt).toLocaleDateString("fa-IR")}</p>
                                  </>
                                ) : (
                                  <p className="text-xs text-muted-foreground">ناموجود</p>
                                )}
                              </div>
                              {isAdmin && (
                                <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRefreshCompetitor(comp.id)} disabled={refreshingCompetitor === comp.id}>
                                    {refreshingCompetitor === comp.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleUnlinkCompetitor(comp.id)}>
                                    <Unlink className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Add Competitor Dialog ═══ */}
      <Dialog open={addCompetitorDialogOpen} onOpenChange={(open) => { setAddCompetitorDialogOpen(open); if (!open) { setCompetitorSource(""); setCompetitorSourceId(""); setCompetitorLinkProductId(""); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-emerald-600" /> افزودن محصول رقیب از فروشگاه آنلاین</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>فروشگاه منبع *</Label>
              <Select value={competitorSource} onValueChange={setCompetitorSource}>
                <SelectTrigger><SelectValue placeholder="فروشگاه را انتخاب کنید" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIGIKALA">🟡 دیجیکالا</SelectItem>
                  <SelectItem value="SNAPPSHOP">🟣 اسنپ‌شاپ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>شناسه محصول *</Label>
              <Input value={competitorSourceId} onChange={(e) => setCompetitorSourceId(e.target.value)} placeholder={competitorSource === "DIGIKALA" ? "مثلاً: 16349888" : competitorSource === "SNAPPSHOP" ? "مثلاً: 717225954" : "شناسه محصول در فروشگاه"} dir="ltr" />
              {competitorSource && (
                <p className="text-xs text-muted-foreground">
                  {competitorSource === "DIGIKALA" ? "شناسه عددی محصول در دیجیکالا (قسمت dkp- از URL)" : "شناسه عددی محصول در اسنپ‌شاپ"}
                </p>
              )}
            </div>
            {!competitorLinkProductId && (
              <div className="space-y-2">
                <Label>اتصال به محصول کاتالوگ (اختیاری)</Label>
                <Select value={competitorLinkProductId} onValueChange={setCompetitorLinkProductId}>
                  <SelectTrigger><SelectValue placeholder="محصول کاتالوگ را انتخاب کنید" /></SelectTrigger>
                  <SelectContent className="max-h-48">
                    {products.map((p) => <SelectItem key={p.id} value={p.id}><span className="line-clamp-1">{p.name}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {competitorLinkProductId && (
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-emerald-700 dark:text-emerald-400">اتصال به: {products.find((p) => p.id === competitorLinkProductId)?.name}</p>
              </div>
            )}
            <Button onClick={handleScrapeAndAdd} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white" disabled={!competitorSource || !competitorSourceId || scrapeLoading}>
              {scrapeLoading ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> در حال اسکرپ...</> : <><Globe className="w-4 h-4 ml-2" /> اسکرپ و ذخیره</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Link Competitor Dialog ═══ */}
      <Dialog open={linkDialogOpen} onOpenChange={(open) => { setLinkDialogOpen(open); if (!open) { setLinkingCompetitor(null); setLinkProductId(""); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" /> اتصال محصول رقیب به کاتالوگ</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            {linkingCompetitor && (
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm font-medium">{linkingCompetitor.name}</p>
                <p className="text-xs text-muted-foreground">{getSourceLabel(linkingCompetitor.source)} — {linkingCompetitor.sourceId}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>محصول کاتالوگ *</Label>
              <Select value={linkProductId} onValueChange={setLinkProductId}>
                <SelectTrigger><SelectValue placeholder="محصول کاتالوگ را انتخاب کنید" /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {products.map((p) => <SelectItem key={p.id} value={p.id}><span className="line-clamp-1">{p.name}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleLinkCompetitor} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white" disabled={!linkProductId}>
              <Link2 className="w-4 h-4 ml-2" /> اتصال
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Competitor Management Dialog ═══ */}
      <Dialog open={competitorManageOpen} onOpenChange={setCompetitorManageOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> مدیریت محصولات رقیب اسکرپ شده</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2">
              <Select value={competitorFilter} onValueChange={(v) => { setCompetitorFilter(v); }}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="unlinked">بدون اتصال</SelectItem>
                  <SelectItem value="DIGIKALA">دیجیکالا</SelectItem>
                  <SelectItem value="SNAPPSHOP">اسنپ‌شاپ</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchAllCompetitors}><RefreshCw className="w-3 h-3" /></Button>
              <Button variant="default" size="sm" className="gap-1 mr-auto bg-gradient-to-r from-emerald-500 to-teal-600 text-white" onClick={() => { setCompetitorLinkProductId(""); setAddCompetitorDialogOpen(true); }}>
                <Plus className="w-3 h-3" /> افزودن
              </Button>
            </div>

            {allCompetitors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">هنوز محصول رقیبی اسکرپ نشده</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {allCompetitors.map((comp) => (
                  <div key={comp.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    {comp.imageUrl ? (
                      <img src={comp.imageUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-sm shrink-0">{getSourceIcon(comp.source)}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{comp.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Badge variant="secondary" className="text-[9px] px-1 py-0">{getSourceLabel(comp.source)}</Badge>
                        {comp.brand && <span>{comp.brand}</span>}
                        {comp.catalogProductId && <span className="text-emerald-600">✓ متصل</span>}
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-sm font-bold">{comp.price > 0 ? formatPrice(comp.price, currencyUnit) : "—"}</p>
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {!comp.catalogProductId && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setLinkingCompetitor(comp); setLinkProductId(""); setLinkDialogOpen(true); }}>
                          <Link2 className="w-3 h-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget({ type: "competitor", id: comp.id, name: comp.name })}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Login Dialog */}
      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-600" /> ورود مدیر سیستم</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2"><Label htmlFor="password">رمز عبور</Label><Input id="password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="رمز عبور مدیر را وارد کنید" onKeyDown={(e) => e.key === "Enter" && handleLogin()} /><p className="text-xs text-muted-foreground">رمز عبور پیش‌فرض: admin123</p></div>
            <Button onClick={handleLogin} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white" disabled={!loginPassword}>ورود</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Dialog */}
      <Dialog open={productDialogOpen} onOpenChange={(open) => { setProductDialogOpen(open); if (!open) { setEditingProduct(null); resetProductForm(); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>{editingProduct ? "ویرایش محصول" : "افزودن محصول جدید"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2"><Label>نام محصول *</Label><Input value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} placeholder="مثلاً: گوشی موبایل سامسونگ" /></div>
            <div className="space-y-2"><Label>قیمت ({currencyUnit}) *</Label><Input type="number" value={productForm.price} onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))} placeholder="مثلاً: 25000000" /></div>
            <div className="space-y-2"><Label>توضیحات</Label><Textarea value={productForm.description} onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))} placeholder="توضیحات محصول..." rows={3} /></div>
            <div className="space-y-2"><Label>آدرس تصویر</Label><Input value={productForm.imageUrl} onChange={(e) => setProductForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://example.com/image.jpg" dir="ltr" /></div>
            <div className="space-y-2"><Label>گروه / دسته‌بندی</Label><Select value={productForm.groupId || "__none__"} onValueChange={(v) => setProductForm((f) => ({ ...f, groupId: v === "__none__" ? "" : v }))}><SelectTrigger><SelectValue placeholder="بدون گروه" /></SelectTrigger><SelectContent><SelectItem value="__none__">بدون گروه</SelectItem>{groups.map((g) => <React.Fragment key={g.id}><SelectItem value={g.id}><span className="font-medium">{g.name}</span></SelectItem>{g.children.map((sub) => <SelectItem key={sub.id} value={sub.id}><span className="text-muted-foreground">└ {sub.name}</span></SelectItem>)}</React.Fragment>)}</SelectContent></Select></div>
            <Button onClick={handleSaveProduct} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white" disabled={!productForm.name || !productForm.price}>{editingProduct ? "بروزرسانی" : "افزودن محصول"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={(open) => { setGroupDialogOpen(open); if (!open) { setEditingGroup(null); setGroupForm({ name: "", parentId: "" }); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FolderTree className="w-5 h-5" /> {editingGroup ? "ویرایش گروه" : "مدیریت گروه‌ها"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            {!editingGroup && (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <p className="text-sm font-medium">افزودن گروه جدید</p>
                <div className="space-y-2"><Label>نام گروه *</Label><Input value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} placeholder="مثلاً: موبایل، لپ‌تاپ" /></div>
                <div className="space-y-2"><Label>گروه والد (برای زیرگروه)</Label><Select value={groupForm.parentId || "__none__"} onValueChange={(v) => setGroupForm((f) => ({ ...f, parentId: v === "__none__" ? "" : v }))}><SelectTrigger><SelectValue placeholder="گروه اصلی (بدون والد)" /></SelectTrigger><SelectContent><SelectItem value="__none__">گروه اصلی (بدون والد)</SelectItem>{groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
                <Button onClick={handleSaveGroup} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white" disabled={!groupForm.name}><FolderPlus className="w-4 h-4 ml-2" /> افزودن {groupForm.parentId ? "زیرگروه" : "گروه اصلی"}</Button>
              </div>
            )}
            {editingGroup && (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <p className="text-sm font-medium">ویرایش: {editingGroup.name}</p>
                <Input value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} placeholder="نام گروه" />
                <div className="flex gap-2"><Button onClick={handleSaveGroup} className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white" disabled={!groupForm.name}>بروزرسانی</Button><Button variant="outline" onClick={() => { setEditingGroup(null); setGroupForm({ name: "", parentId: "" }); }}>انصراف</Button></div>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">گروه‌های موجود</p>
              {groups.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">هنوز گروهی ایجاد نشده</p> : (
                <Accordion type="multiple" className="w-full">
                  {groups.map((group) => (
                    <AccordionItem key={group.id} value={group.id}>
                      <AccordionTrigger className="hover:no-underline py-2">
                        <div className="flex items-center gap-2 flex-1"><FolderOpen className="w-4 h-4 text-emerald-600" /><span className="font-medium text-sm">{group.name}</span><Badge variant="secondary" className="text-xs">{group.children.length} زیرگروه</Badge></div>
                        <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingGroup(group); setGroupForm({ name: group.name, parentId: "" }); }}><Edit3 className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget({ type: "group", id: group.id, name: group.name })}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {group.children.length === 0 ? <p className="text-xs text-muted-foreground pr-8 py-1">زیرگروهی ندارد</p> : (
                          <div className="space-y-1 pr-6">{group.children.map((sub) => (
                            <div key={sub.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted">
                              <div className="flex items-center gap-2"><FolderTree className="w-3 h-3 text-muted-foreground" /><span className="text-sm">{sub.name}</span></div>
                              <div className="flex gap-1"><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingGroup(sub as unknown as ProductGroupParent); setGroupForm({ name: sub.name, parentId: group.id }); }}><Edit3 className="w-3 h-3" /></Button><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleteTarget({ type: "group", id: sub.id, name: sub.name })}><Trash2 className="w-3 h-3" /></Button></div>
                            </div>))}</div>
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
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5" /> تنظیمات سیستم</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2"><Label>واحد پول</Label><Select value={settingsForm.currencyUnit} onValueChange={(v) => setSettingsForm((f) => ({ ...f, currencyUnit: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="تومان">تومان</SelectItem><SelectItem value="ریال">ریال</SelectItem><SelectItem value="دلار">$ دلار</SelectItem><SelectItem value="یورو">€ یورو</SelectItem><SelectItem value="درهم">درهم</SelectItem></SelectContent></Select></div>
            <Separator />
            <div className="space-y-3"><p className="text-sm font-medium">تغییر رمز عبور</p><div className="space-y-2"><Label>رمز عبور فعلی</Label><Input type="password" value={settingsForm.currentPassword} onChange={(e) => setSettingsForm((f) => ({ ...f, currentPassword: e.target.value }))} placeholder="رمز فعلی را وارد کنید" /></div><div className="space-y-2"><Label>رمز عبور جدید</Label><Input type="password" value={settingsForm.adminPassword} onChange={(e) => setSettingsForm((f) => ({ ...f, adminPassword: e.target.value }))} placeholder="رمز جدید را وارد کنید" /></div><p className="text-xs text-muted-foreground">اگر نمی‌خواهید رمز را تغییر دهید، این بخش را خالی بگذارید.</p></div>
            <Button onClick={handleSaveSettings} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white">ذخیره تنظیمات</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader><AlertDialogTitle>آیا مطمئن هستید؟</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "product" ? <span>محصول &laquo;{deleteTarget.name && deleteTarget.name.length > 50 ? deleteTarget.name.slice(0, 50) + "…" : deleteTarget.name}&raquo; حذف خواهد شد.</span> : deleteTarget?.type === "group" ? <span>گروه &laquo;{deleteTarget.name}&raquo; همراه با زیرگروه‌ها حذف خواهد شد. محصولات این گروه بدون گروه می‌شوند.</span> : deleteTarget?.type === "competitor" ? <span>محصول رقیب &laquo;{deleteTarget.name && deleteTarget.name.length > 50 ? deleteTarget.name.slice(0, 50) + "…" : deleteTarget.name}&raquo; حذف خواهد شد.</span> : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteTarget) { if (deleteTarget.type === "product") handleDeleteProduct(deleteTarget.id); else if (deleteTarget.type === "group") handleDeleteGroup(deleteTarget.id); else if (deleteTarget.type === "competitor") handleDeleteCompetitor(deleteTarget.id); } setDeleteTarget(null); }}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
