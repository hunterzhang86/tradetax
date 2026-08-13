"use client";

import { useCallback, useState } from "react";
import type { CostBasisMethod, ParsedStatement, TaxResult } from "@/lib/types";
import { parseStatement } from "@/lib/parsers";
import { calculateTax } from "@/lib/calculator";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { UploadSection } from "@/components/UploadSection";
import { ResultsSection } from "@/components/ResultsSection";
import { PrivacySection } from "@/components/PrivacySection";
import { MethodologySection } from "@/components/MethodologySection";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";

export default function Home() {
  const [statements, setStatements] = useState<ParsedStatement[]>([]);
  const [results, setResults] = useState<TaxResult[]>([]);
  const [method, setMethod] = useState<CostBasisMethod>("FIFO");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recompute = useCallback(
    (all: ParsedStatement[], m: CostBasisMethod) => {
      setResults(calculateTax(all, m));
    },
    [],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      setIsProcessing(true);
      setError(null);
      try {
        const parsed: ParsedStatement[] = [];
        for (const file of files) {
          const buffer = await file.arrayBuffer();
          parsed.push(parseStatement(buffer, file.name));
        }
        setStatements((prev) => {
          const all = [...prev, ...parsed];
          recompute(all, method);
          return all;
        });
      } catch (err) {
        console.error("解析失败:", err);
        setError(err instanceof Error ? err.message : "文件解析失败, 请检查文件格式");
      } finally {
        setIsProcessing(false);
      }
    },
    [method, recompute],
  );

  const handleMethodChange = useCallback(
    (m: CostBasisMethod) => {
      setMethod(m);
      if (statements.length > 0) recompute(statements, m);
    },
    [statements, recompute],
  );

  const handleClear = useCallback(() => {
    setStatements([]);
    setResults([]);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <UploadSection
          statements={statements}
          isProcessing={isProcessing}
          error={error}
          method={method}
          onFiles={handleFiles}
          onMethodChange={handleMethodChange}
          onClear={handleClear}
        />
        {results.length > 0 && <ResultsSection results={results} />}
        <PrivacySection />
        <MethodologySection />
        <FaqSection />
      </main>
      <Footer />
    </div>
  );
}
