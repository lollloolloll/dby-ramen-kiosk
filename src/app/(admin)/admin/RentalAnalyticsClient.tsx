"use client";

import { useState, useEffect, useMemo } from "react";
import { getRentalAnalytics } from "@/lib/actions/rental";
import { AnalyticsData } from "@/lib/types/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
} from "recharts";
import { useDebounce } from "@/lib/shared/use-debounce";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#AF19FF"];

const MemoizedAgeBarChart = ({
  data,
}: {
  data: Array<{ name: string; count: number; uniqueUsers: number }>;
}) => (
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="name" />
      <YAxis allowDecimals={false} />
      <Tooltip />
      <Legend />
      <Bar dataKey="count" fill="#8884d8" name="대여 건수" />
      <Bar dataKey="uniqueUsers" fill="#82ca9d" name="이용자 수" />
    </BarChart>
  </ResponsiveContainer>
);

const MemoizedCategoryPieChart = ({ data }: { data: any[] }) => (
  <ResponsiveContainer width="100%" height={300}>
    <PieChart>
      <Pie
        data={data}
        dataKey="totalRentals"
        nameKey="category"
        cx="50%"
        cy="50%"
        outerRadius={100}
        fill="#8884d8"
        label
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(value) => `${value}건`} />
      <Legend />
    </PieChart>
  </ResponsiveContainer>
);

const MemoizedGenderPieChart = ({
  data,
}: {
  data: { name: string; value: number }[];
}) => (
  <ResponsiveContainer width="100%" height={300}>
    <PieChart>
      <Pie
        data={data}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius={100}
        fill="#8884d8"
        label={({ name, percent }) =>
          `${name} ${((percent as number) * 100).toFixed(0)}%`
        }
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(value) => `${value}건`} />
      <Legend />
    </PieChart>
  </ResponsiveContainer>
);

const MemoizedDayOfWeekChart = ({
  data,
}: {
  data: { name: string; count: number }[];
}) => (
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="name" />
      <YAxis allowDecimals={false} />
      <Tooltip />
      <Bar dataKey="count" fill="#82ca9d" name="대여 건수" />
    </BarChart>
  </ResponsiveContainer>
);

const MemoizedHourlyChart = ({
  data,
}: {
  data: { name: string; count: number }[];
}) => (
  <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="name"
        label={{ value: "시간", position: "insideBottomRight", offset: -5 }}
      />
      <YAxis allowDecimals={false} />
      <Tooltip />
      <Legend />
      <Line
        type="monotone"
        dataKey="count"
        stroke="#8884d8"
        name="대여 건수"
        activeDot={{ r: 8 }}
      />
    </LineChart>
  </ResponsiveContainer>
);

export function RentalAnalyticsClient({
  initialData,
  categories,
  availableYears,
}: {
  initialData: AnalyticsData;
  categories: string[];
  availableYears: number[];
}) {
  const [analyticsData, setAnalyticsData] =
    useState<AnalyticsData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();

  const getDefaultYear = () => {
    const sortedYears = [...availableYears].sort((a, b) => b - a);

    if (availableYears.includes(currentYear)) {
      return currentYear.toString();
    }
    if (sortedYears.length > 0) {
      return sortedYears[0].toString();
    }
    return currentYear.toString();
  };

  const [filters, setFilters] = useState({
    year: getDefaultYear(),
    month: "all",
    ageGroup: "all",
    category: "all",
  });

  const debouncedFilters = useDebounce(filters, 500);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getRentalAnalytics(debouncedFilters);
        setAnalyticsData(data);
      } catch (err) {
        setError("데이터를 불러오는 데 실패했습니다.");
        console.error(err);
      }
      setLoading(false);
    };

    fetchData();
  }, [debouncedFilters]);

  const handleFilterChange = (filterName: string, value: string) => {
    setFilters((prev) => ({ ...prev, [filterName]: value }));
  };

  const ageGroupMap: { [key: string]: string } = {
    all: "전체 연령대",
    child: "아동",
    teen: "청소년",
    adult: "성인",
  };

  const ageGroupData = useMemo(
    () => [
      { name: "아동", ...analyticsData.ageGroupStats.child },
      { name: "청소년", ...analyticsData.ageGroupStats.teen },
      { name: "성인", ...analyticsData.ageGroupStats.adult },
    ],
    [analyticsData.ageGroupStats]
  );

  const sortedAvailableYears = useMemo(
    () => [...availableYears].sort((a, b) => b - a),
    [availableYears]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg bg-card">
        <Select
          value={filters.year}
          onValueChange={(value) => handleFilterChange("year", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="연도 선택" />
          </SelectTrigger>
          <SelectContent>
            {sortedAvailableYears.length > 0 ? (
              sortedAvailableYears.map((y) => (
                <SelectItem key={y.toString()} value={y.toString()}>
                  {y}년
                </SelectItem>
              ))
            ) : (
              <SelectItem value={currentYear.toString()}>
                {currentYear}년
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <Select
          value={filters.month}
          onValueChange={(value) => handleFilterChange("month", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="월 선택" />
          </SelectTrigger>
          <SelectContent>
            {[
              "all",
              ...Array.from({ length: 12 }, (_, i) => (i + 1).toString()),
            ].map((m) => (
              <SelectItem key={m} value={m}>
                {m === "all" ? "전체(월)" : `${m}월`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.ageGroup}
          onValueChange={(value) => handleFilterChange("ageGroup", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="연령대 선택" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ageGroupMap).map(([key, value]) => (
              <SelectItem key={key} value={key}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.category}
          onValueChange={(value) => handleFilterChange("category", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="카테고리 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="text-red-500 p-4 border border-red-500 bg-red-100 rounded-md">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  총 대여 건수
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {analyticsData.kpis.totalRentals.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  총 이용자 수
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {analyticsData.kpis.uniqueUsers.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  가장 인기 있는 품목
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold truncate">
                  {analyticsData.kpis.mostPopularItem?.name || "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {analyticsData.kpis.mostPopularItem?.rentals || 0}회
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  가장 인기 있는 카테고리
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold truncate">
                  {analyticsData.kpis.mostPopularCategory?.name || "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {analyticsData.kpis.mostPopularCategory?.rentals || 0}회
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>연령 그룹별 대여 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : (
              <>
                <MemoizedAgeBarChart data={ageGroupData} />
                <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[oklch(0.75_0.12_165)]" />
                      아동 (만 8세 이하)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[oklch(0.7_0.18_350)]" />
                      청소년 (만 9~24세)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[oklch(0.65_0.15_280)]" />
                      성인 (만 25세 이상)
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>카테고리별 대여 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : (
              <MemoizedCategoryPieChart data={analyticsData.categoryStats} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>요일별 대여 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : (
              <MemoizedDayOfWeekChart data={analyticsData.dayOfWeekStats} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>시간대별 대여 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : (
              <MemoizedHourlyChart data={analyticsData.hourStats} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>인기 품목 TOP 10</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>순위</TableHead>
                    <TableHead>품목명</TableHead>
                    <TableHead className="text-right">대여 횟수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyticsData.itemStats.topItems.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-right">
                        {item.rentals}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>성별 대여 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : (
              <MemoizedGenderPieChart data={analyticsData.genderStats} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {loading ? (
          <Skeleton className="h-[300px] lg:col-span-2" />
        ) : (
          analyticsData.peopleCountItemStats?.map((stat) => (
            <Card key={stat.peopleCount}>
              <CardHeader>
                <CardTitle>{stat.peopleCount}인 대여 인기 품목</CardTitle>
              </CardHeader>
              <CardContent>
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">순위</TableHead>
                      <TableHead className="w-auto">품목명</TableHead>
                      <TableHead className="w-20 text-right">대여수</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stat.items.slice(0, 5).map((item, idx) => (
                      <TableRow key={item.itemId}>
                        <TableCell className="w-12">{idx + 1}</TableCell>
                        <TableCell className="w-auto truncate">
                          {item.itemName}
                        </TableCell>
                        <TableCell className="w-20 text-right">
                          {item.rentals}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
