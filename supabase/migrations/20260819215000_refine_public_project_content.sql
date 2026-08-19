-- Keep the public lyric credits in the requested billing order without relying on record UUIDs.
update public.release_credits as credit
set sort_order = case credit.display_name
  when '단비' then 10
  when '윤슬' then 20
  else credit.sort_order
end
from public.release_roles as role
join public.music_releases as release
  on release.id = role.release_id
where credit.release_role_id = role.id
  and release.project_slug = 'ibyeol-ui-dosu'
  and release.release_number = 1
  and role.role_type_code = 'lyrics'
  and credit.display_name in ('단비', '윤슬')
  and credit.sort_order is distinct from case credit.display_name
    when '단비' then 10
    when '윤슬' then 20
    else credit.sort_order
  end;

-- Replace only the requested sentence so the existing participation invitation remains intact.
update public.music_releases
set summary = replace(
  summary,
  'Jinbo의 비트와 2명의 래퍼와 같이 제작한 음원으로 10월 오피셜 발매 예정인 음원입니다.',
  'Jinbo의 비트에 2명의 래퍼가 함께 한 음원이 10월 오피셜 발매 예정입니다.'
)
where project_slug = 'vintagechord-post-production'
  and release_number = 4
  and strpos(
    summary,
    'Jinbo의 비트와 2명의 래퍼와 같이 제작한 음원으로 10월 오피셜 발매 예정인 음원입니다.'
  ) > 0;
