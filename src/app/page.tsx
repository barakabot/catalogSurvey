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
  ArrowRight,
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
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

// Types
interface PriceHistory {
  id: string;
  price: number;
  fetchedAt: string;
}

interface CompetitorLink {
  id: string;
  productId: string;
  name: string;
  url: string;
  linkType: string;
  priceSelector: string | null;
  lastPrice: number | null;
  lastFetchedAt: string | null;
  priceHistory?: PriceHistory[];
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  links: CompetitorLink[];
}

// Format price with commas
function formatPrice(price: number): string {
  return new Intl.NumberFormat("fa-IR").format(price) + " تومان";
}

// Get price trend icon
function getPriceTrend(history?: PriceHistory[]) {
  if (!history || history.length < 2) return null;
  const latest = history[0].price;
  const previous = history[1].price;
  if (latest < previous) return <TrendingDown className="w-4 h-4 text-emerald-500" />;
  if (latest > previous) return <TrendingUp className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

export default function CatalogPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [fetchingPrices, setFetchingPrices] = useState<Set<string>>(new Set());

  // Dialog states
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkProductId, setLinkProductId] = useState<string>("");
  const [editingLink, setEditingLink] = useState<CompetitorLink | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "product" | "link";
    id: string;
    parentId?: string;
  } | null>(null);

  // Form states
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    imageUrl: "",
    category: "",
  });
  const [linkForm, setLinkForm] = useState({
    name: "",
    url: "",
    linkType: "WEBSITE",
    priceSelector: "",
  });

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setProducts(data);
    } catch {
      toast({
        title: "خطا",
        description: "دریافت محصولات ناموفق بود",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Get unique categories
  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  // Filter products
  const filteredProducts = React.useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        selectedCategory === "all" || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // Product CRUD
  const handleSaveProduct = async () => {
    try {
      const url = editingProduct
        ? `/api/products/${editingProduct.id}`
        : "/api/products";
      const method = editingProduct ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name,
          description: productForm.description || null,
          price: parseFloat(productForm.price),
          imageUrl: productForm.imageUrl || null,
          category: productForm.category || null,
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
      toast({
        title: "خطا",
        description: "ذخیره محصول ناموفق بود",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");

      toast({ title: "محصول حذف شد" });
      fetchProducts();
    } catch {
      toast({
        title: "خطا",
        description: "حذف محصول ناموفق بود",
        variant: "destructive",
      });
    }
  };

  // Link CRUD
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
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast({
        title: editingLink ? "لینک بروزرسانی شد" : "لینک رقیب اضافه شد",
        description: linkForm.name,
      });

      setLinkDialogOpen(false);
      setEditingLink(null);
      resetLinkForm();
      fetchProducts();
    } catch {
      toast({
        title: "خطا",
        description: "ذخیره لینک ناموفق بود",
        variant: "destructive",
      });
    }
  };

  const handleDeleteLink = async (productId: string, linkId: string) => {
    try {
      const res = await fetch(`/api/products/${productId}/links/${linkId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");

      toast({ title: "لینک حذف شد" });
      fetchProducts();
    } catch {
      toast({
        title: "خطا",
        description: "حذف لینک ناموفق بود",
        variant: "destructive",
      });
    }
  };

  // Fetch competitor prices
  const handleFetchPrices = async (productId: string) => {
    setFetchingPrices((prev) => new Set(prev).add(productId));
    try {
      const res = await fetch(`/api/products/${productId}/fetch-prices`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to fetch prices");

      const data = await res.json();

      const successCount = data.results.filter(
        (r: { success: boolean }) => r.success
      ).length;
      const failCount = data.results.filter(
        (r: { success: boolean }) => !r.success
      ).length;

      toast({
        title: "استخراج قیمت‌ها انجام شد",
        description: `${successCount} موفق${failCount > 0 ? `، ${failCount} ناموفق` : ""}`,
        variant: failCount > 0 && successCount === 0 ? "destructive" : "default",
      });

      // Update products state
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                links: p.links.map((link) => {
                  const result = data.results.find(
                    (r: { linkId: string }) => r.linkId === link.id
                  );
                  if (result?.success) {
                    return {
                      ...link,
                      lastPrice: result.price,
                      lastFetchedAt: new Date().toISOString(),
                    };
                  }
                  return link;
                }),
              }
            : p
        )
      );

      fetchProducts();
    } catch {
      toast({
        title: "خطا",
        description: "استخراج قیمت‌ها ناموفق بود",
        variant: "destructive",
      });
    } finally {
      setFetchingPrices((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const resetProductForm = () => {
    setProductForm({ name: "", description: "", price: "", imageUrl: "", category: "" });
  };

  const resetLinkForm = () => {
    setLinkForm({ name: "", url: "", linkType: "WEBSITE", priceSelector: "" });
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description || "",
      price: String(product.price),
      imageUrl: product.imageUrl || "",
      category: product.category || "",
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
    });
    setLinkDialogOpen(true);
  };

  // Get best competitor price
  const getBestCompetitorPrice = (product: Product) => {
    const prices = product.links
      .filter((l) => l.lastPrice !== null)
      .map((l) => l.lastPrice as number);
    if (prices.length === 0) return null;
    return Math.min(...prices);
  };

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
                <h1 className="text-xl font-bold text-foreground">
                  کاتالوگ دیجیتال
                </h1>
                <p className="text-xs text-muted-foreground">
                  مقایسه قیمت محصولات با رقبا
                </p>
              </div>
            </div>

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
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingProduct(null);
                    resetProductForm();
                  }}
                  className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20"
                >
                  <Plus className="w-4 h-4" />
                  افزودن محصول
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md" dir="rtl">
                <DialogHeader>
                  <DialogTitle>
                    {editingProduct ? "ویرایش محصول" : "افزودن محصول جدید"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">نام محصول *</Label>
                    <Input
                      id="name"
                      value={productForm.name}
                      onChange={(e) =>
                        setProductForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="مثلاً: گوشی موبایل سامسونگ"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">قیمت (تومان) *</Label>
                    <Input
                      id="price"
                      type="number"
                      value={productForm.price}
                      onChange={(e) =>
                        setProductForm((f) => ({ ...f, price: e.target.value }))
                      }
                      placeholder="مثلاً: 25000000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">توضیحات</Label>
                    <Textarea
                      id="description"
                      value={productForm.description}
                      onChange={(e) =>
                        setProductForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      placeholder="توضیحات محصول..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imageUrl">آدرس تصویر</Label>
                    <Input
                      id="imageUrl"
                      value={productForm.imageUrl}
                      onChange={(e) =>
                        setProductForm((f) => ({
                          ...f,
                          imageUrl: e.target.value,
                        }))
                      }
                      placeholder="https://example.com/image.jpg"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">دسته‌بندی</Label>
                    <Input
                      id="category"
                      value={productForm.category}
                      onChange={(e) =>
                        setProductForm((f) => ({
                          ...f,
                          category: e.target.value,
                        }))
                      }
                      placeholder="مثلاً: موبایل، لپ‌تاپ"
                    />
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
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            {categories.length > 0 && (
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="دسته‌بندی" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه دسته‌ها</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
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
              {products.length === 0
                ? "هنوز محصولی اضافه نشده"
                : "محصولی یافت نشد"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              {products.length === 0
                ? "برای شروع، اولین محصول خود را اضافه کنید و سپس لینک رقبای خود را برای مقایسه قیمت وارد کنید."
                : "فیلترهای خود را تغییر دهید یا عبارت جستجوی دیگری امتحان کنید."}
            </p>
            {products.length === 0 && (
              <Button
                onClick={() => {
                  setEditingProduct(null);
                  resetProductForm();
                  setProductDialogOpen(true);
                }}
                className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
              >
                <Plus className="w-4 h-4" />
                افزودن محصول
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

                return (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`${isExpanded ? "sm:col-span-2 lg:col-span-3" : ""}`}
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
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                          {product.category && (
                            <Badge className="absolute top-3 right-3 bg-white/90 dark:bg-slate-800/90 text-foreground backdrop-blur-sm">
                              <Tag className="w-3 h-3 ml-1" />
                              {product.category}
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
                            {!product.imageUrl && product.category && (
                              <Badge className="mt-2" variant="secondary">
                                <Tag className="w-3 h-3 ml-1" />
                                {product.category}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1 mr-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditProduct(product)}
                            >
                              <Edit3 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  type: "product",
                                  id: product.id,
                                })
                              }
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="pb-2">
                        {/* Price Section */}
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-muted-foreground">
                              قیمت شما:
                            </span>
                            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                              {formatPrice(product.price)}
                            </p>
                          </div>
                          {bestPrice !== null && (
                            <div className="text-left">
                              <span className="text-xs text-muted-foreground">
                                ارزان‌ترین رقیب:
                              </span>
                              <p className="text-lg font-semibold text-foreground">
                                {formatPrice(bestPrice)}
                              </p>
                              {bestPrice > product.price && (
                                <Badge
                                  variant="default"
                                  className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs"
                                >
                                  شما ارزان‌تر هستید!
                                </Badge>
                              )}
                              {bestPrice <= product.price && (
                                <Badge
                                  variant="destructive"
                                  className="text-xs"
                                >
                                  رقیب ارزان‌تر
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Competitor Links Summary */}
                        {hasLinks && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                            <Link2 className="w-4 h-4" />
                            <span>
                              {product.links.length} لینک رقیب
                            </span>
                            <span className="text-xs">
                              (
                              {product.links.filter((l) => l.lastPrice !== null)
                                .length}{" "}
                              قیمت استخراج شده)
                            </span>
                          </div>
                        )}
                      </CardContent>

                      <CardFooter className="flex flex-col items-stretch gap-3 pt-2">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-2"
                            onClick={() => openAddLink(product.id)}
                          >
                            <Plus className="w-3 h-3" />
                            افزودن لینک
                          </Button>
                          {hasLinks && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 gap-2"
                                onClick={() =>
                                  handleFetchPrices(product.id)
                                }
                                disabled={isFetching}
                              >
                                {isFetching ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                استخراج قیمت
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                onClick={() =>
                                  setExpandedProduct(
                                    isExpanded ? null : product.id
                                  )
                                }
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
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
                                        <p className="text-sm font-medium truncate">
                                          {link.name}
                                        </p>
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
                                        {link.lastPrice !== null ? (
                                          <>
                                            <p className="text-sm font-bold">
                                              {formatPrice(link.lastPrice)}
                                            </p>
                                            {link.lastFetchedAt && (
                                              <p className="text-[10px] text-muted-foreground">
                                                {new Date(
                                                  link.lastFetchedAt
                                                ).toLocaleDateString("fa-IR")}
                                              </p>
                                            )}
                                          </>
                                        ) : (
                                          <p className="text-xs text-muted-foreground">
                                            قیمت استخراج نشده
                                          </p>
                                        )}
                                      </div>
                                      {getPriceTrend(link.priceHistory)}
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() =>
                                            openEditLink(product.id, link)
                                          }
                                        >
                                          <Edit3 className="w-3 h-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-destructive hover:text-destructive"
                                          onClick={() =>
                                            setDeleteTarget({
                                              type: "link",
                                              id: link.id,
                                              parentId: product.id,
                                            })
                                          }
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {product.links.length === 0 && (
                                  <p className="text-sm text-muted-foreground text-center py-4">
                                    لینک رقیبی اضافه نشده است
                                  </p>
                                )}
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
            {products.length} محصول •{" "}
            {products.reduce((sum, p) => sum + p.links.length, 0)} لینک رقیب
          </p>
        </div>
      </footer>

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
            <DialogTitle>
              {editingLink ? "ویرایش لینک رقیب" : "افزودن لینک رقیب"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="linkName">نام رقیب / منبع *</Label>
              <Input
                id="linkName"
                value={linkForm.name}
                onChange={(e) =>
                  setLinkForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="مثلاً: دیجی‌کالا، تکنولایف"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkUrl">آدرس لینک *</Label>
              <Input
                id="linkUrl"
                value={linkForm.url}
                onChange={(e) =>
                  setLinkForm((f) => ({ ...f, url: e.target.value }))
                }
                placeholder="https://example.com/product/123"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkType">نوع لینک</Label>
              <Select
                value={linkForm.linkType}
                onValueChange={(val) =>
                  setLinkForm((f) => ({ ...f, linkType: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEBSITE">
                    <span className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      وب‌سایت (استخراج با CSS/LLM)
                    </span>
                  </SelectItem>
                  <SelectItem value="API">
                    <span className="flex items-center gap-2">
                      <Code2 className="w-4 h-4" />
                      API (استخراج با JSON Path)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceSelector">
                {linkForm.linkType === "API"
                  ? "مسیر JSON (مثلاً: data.price)"
                  : "انتخابگر CSS (اختیاری)"}
              </Label>
              <Input
                id="priceSelector"
                value={linkForm.priceSelector}
                onChange={(e) =>
                  setLinkForm((f) => ({
                    ...f,
                    priceSelector: e.target.value,
                  }))
                }
                placeholder={
                  linkForm.linkType === "API"
                    ? "data.price یا result.items[0].amount"
                    : ".product-price یا #price"
                }
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                {linkForm.linkType === "API"
                  ? "مسیر فیلد قیمت در پاسخ JSON را وارد کنید. این فیلد الزامی است."
                  : "اگر انتخابگر CSS وارد نکنید، از هوش مصنوعی برای استخراج قیمت استفاده می‌شود."}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>آیا مطمئن هستید؟</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "product"
                ? "این محصول همراه با تمام لینک‌های رقیب و تاریخچه قیمت‌های آن حذف خواهد شد. این عمل قابل بازگشت نیست."
                : "این لینک رقیب همراه با تاریخچه قیمت‌های آن حذف خواهد شد."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  if (deleteTarget.type === "product") {
                    handleDeleteProduct(deleteTarget.id);
                  } else if (deleteTarget.parentId) {
                    handleDeleteLink(deleteTarget.parentId, deleteTarget.id);
                  }
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
