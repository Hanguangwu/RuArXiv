import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthorProfile } from "@/lib/queries";
import { ROLE_LABELS, isRole } from "@/lib/constants";
import { Avatar } from "@/components/avatar";
import { PaperRow } from "@/components/paper-row";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ login: string }>;
}): Promise<Metadata> {
  const { login } = await params;
  const profile = await getAuthorProfile(login);
  return { title: `${profile.name} (@${profile.login})` };
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;
  const profile = await getAuthorProfile(login);
  if (!profile.found) notFound();

  return (
    <div className="container-page py-8">
      <header className="border-b border-[var(--color-line)] pb-6">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar src={profile.avatarUrl} name={profile.name} size={72} className="border-2" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="font-serif text-[1.8rem] font-semibold">{profile.name}</h1>
              <span className="text-[0.85rem] text-[var(--color-ink-faint)]">@{profile.login}</span>
              {profile.role && isRole(profile.role) && (
                <span className="chip chip-moss">{ROLE_LABELS[profile.role]}</span>
              )}
            </div>
            <p className="mt-1 text-[0.8rem] text-[var(--color-ink-soft)]">
              {profile.affiliation ?? "未填写单位"}
            </p>
            {profile.bio && (
              <p className="mt-2.5 max-w-2xl text-[0.85rem] leading-relaxed text-[var(--color-ink-soft)]">
                {profile.bio}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <div className="stat-number text-[1.2rem]">{profile.stats.papers}</div>
                <div className="text-[0.65rem] text-[var(--color-ink-faint)]">论文</div>
              </div>
              <div>
                <div className="stat-number text-[1.2rem]">{profile.stats.score}</div>
                <div className="text-[0.65rem] text-[var(--color-ink-faint)]">总评分</div>
              </div>
              <div>
                <div className="stat-number text-[1.2rem]">{profile.stats.comments}</div>
                <div className="text-[0.65rem] text-[var(--color-ink-faint)]">收到的讨论</div>
              </div>
              <div>
                <div className="stat-number text-[1.2rem]">{profile.categories.length}</div>
                <div className="text-[0.65rem] text-[var(--color-ink-faint)]">涉及分类</div>
              </div>
            </div>
            {profile.categories.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {profile.categories.map((category) => (
                  <Link key={category} href={`/categories/${category}`} className="chip">
                    {category}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="mt-7">
        <div className="flex items-baseline justify-between border-b border-[var(--color-line)] pb-2">
          <h2 className="font-serif text-[1.2rem] font-semibold">论文</h2>
          <span className="text-[0.7rem] text-[var(--color-ink-faint)]">{profile.papers.length} 篇</span>
        </div>
        {profile.papers.length === 0 ? (
          <p className="py-8 text-sm text-[var(--color-ink-faint)]">这位作者还没有已发布的论文。</p>
        ) : (
          <div>
            {profile.papers.map((paper, index) => (
              <PaperRow key={paper.id} paper={paper} index={index} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
