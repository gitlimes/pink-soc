import { useCallback, useState, useEffect, useRef } from 'react';

import { defineMessages, useIntl, FormattedMessage } from 'react-intl';

import { Helmet } from 'react-helmet';
import { useParams, Link } from 'react-router-dom';

import { useDebouncedCallback } from 'use-debounce';

import ListAltIcon from '@/material-icons/400-24px/list_alt.svg?react';
import SquigglyArrow from '@/svg-icons/squiggly_arrow.svg?react';
import { importFetchedAccounts } from 'flavours/glitch/actions/importer';
import { fetchList } from 'flavours/glitch/actions/lists';
import { apiRequest } from 'flavours/glitch/api';
import {
  apiGetAccounts,
  apiAddAccountToList,
  apiRemoveAccountFromList,
} from 'flavours/glitch/api/lists';
import type { ApiAccountJSON } from 'flavours/glitch/api_types/accounts';
import { Avatar } from 'flavours/glitch/components/avatar';
import { Button } from 'flavours/glitch/components/button';
import { Column } from 'flavours/glitch/components/column';
import { ColumnHeader } from 'flavours/glitch/components/column_header';
import { ColumnSearchHeader } from 'flavours/glitch/components/column_search_header';
import { FollowersCounter } from 'flavours/glitch/components/counters';
import { DisplayName } from 'flavours/glitch/components/display_name';
import ScrollableList from 'flavours/glitch/components/scrollable_list';
import { ShortNumber } from 'flavours/glitch/components/short_number';
import { VerifiedBadge } from 'flavours/glitch/components/verified_badge';
import { useAppDispatch, useAppSelector } from 'flavours/glitch/store';

const messages = defineMessages({
  heading: { id: 'column.list_members', defaultMessage: 'Manage list members' },
  placeholder: {
    id: 'lists.search_placeholder',
    defaultMessage: 'Search people you follow',
  },
  enterSearch: { id: 'lists.add_to_list', defaultMessage: 'Add to list' },
  add: { id: 'lists.add_member', defaultMessage: 'Add' },
  remove: { id: 'lists.remove_member', defaultMessage: 'Remove' },
  back: { id: 'column_back_button.label', defaultMessage: 'Back' },
});

type Mode = 'remove' | 'add';

const AccountItem: React.FC<{
  accountId: string;
  listId: string;
  partOfList: boolean;
  onToggle: (accountId: string) => void;
}> = ({ accountId, listId, partOfList, onToggle }) => {
  const intl = useIntl();
  const account = useAppSelector((state) => state.accounts.get(accountId));

  const handleClick = useCallback(() => {
    if (partOfList) {
      void apiRemoveAccountFromList(listId, accountId);
    } else {
      void apiAddAccountToList(listId, accountId);
    }

    onToggle(accountId);
  }, [accountId, listId, partOfList, onToggle]);

  if (!account) {
    return null;
  }

  const firstVerifiedField = account.fields.find((item) => !!item.verified_at);

  return (
    <div className='account'>
      <div className='account__wrapper'>
        <Link
          key={account.id}
          className='account__display-name'
          title={account.acct}
          to={`/@${account.acct}`}
          data-hover-card-account={account.id}
        >
          <div className='account__avatar-wrapper'>
            <Avatar account={account} size={36} />
          </div>

          <div className='account__contents'>
            <DisplayName account={account} />

            <div className='account__details'>
              <ShortNumber
                value={account.followers_count}
                renderer={FollowersCounter}
              />{' '}
              {firstVerifiedField && (
                <VerifiedBadge link={firstVerifiedField.value} />
              )}
            </div>
          </div>
        </Link>

        <div className='account__relationship'>
          <Button
            text={intl.formatMessage(
              partOfList ? messages.remove : messages.add,
            )}
            secondary={partOfList}
            onClick={handleClick}
          />
        </div>
      </div>
    </div>
  );
};

const ListMembers: React.FC<{
  multiColumn?: boolean;
}> = ({ multiColumn }) => {
  const dispatch = useAppDispatch();
  const { id } = useParams<{ id: string }>();
  const intl = useIntl();

  const [searching, setSearching] = useState(false);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [searchAccountIds, setSearchAccountIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('remove');

  useEffect(() => {
    if (id) {
      setLoading(true);
      dispatch(fetchList(id));

      void apiGetAccounts(id)
        .then((data) => {
          dispatch(importFetchedAccounts(data));
          setAccountIds(data.map((a) => a.id));
          setLoading(false);
          return '';
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [dispatch, id]);

  const handleSearchClick = useCallback(() => {
    setMode('add');
  }, [setMode]);

  const handleDismissSearchClick = useCallback(() => {
    setMode('remove');
    setSearching(false);
  }, [setMode]);

  const handleAccountToggle = useCallback(
    (accountId: string) => {
      const partOfList = accountIds.includes(accountId);

      if (partOfList) {
        setAccountIds(accountIds.filter((id) => id !== accountId));
      } else {
        setAccountIds([accountId, ...accountIds]);
      }
    },
    [accountIds, setAccountIds],
  );

  const searchRequestRef = useRef<AbortController | null>(null);

  const handleSearch = useDebouncedCallback(
    (value: string) => {
      if (searchRequestRef.current) {
        searchRequestRef.current.abort();
      }

      if (value.trim().length === 0) {
        setSearching(false);
        return;
      }

      setLoading(true);

      searchRequestRef.current = new AbortController();

      void apiRequest<ApiAccountJSON[]>('GET', 'v1/accounts/search', {
        signal: searchRequestRef.current.signal,
        params: {
          q: value,
          resolve: false,
          following: true,
        },
      })
        .then((data) => {
          dispatch(importFetchedAccounts(data));
          setSearchAccountIds(data.map((a) => a.id));
          setLoading(false);
          setSearching(true);
          return '';
        })
        .catch(() => {
          setSearching(true);
          setLoading(false);
        });
    },
    500,
    { leading: true, trailing: true },
  );

  let displayedAccountIds: string[];

  if (mode === 'add' && searching) {
    displayedAccountIds = searchAccountIds;
  } else {
    displayedAccountIds = accountIds;
  }

  return (
    <Column
      bindToDocument={!multiColumn}
      label={intl.formatMessage(messages.heading)}
    >
      <ColumnHeader
        title={intl.formatMessage(messages.heading)}
        icon='list-ul'
        iconComponent={ListAltIcon}
        multiColumn={multiColumn}
        showBackButton
      />

      <ColumnSearchHeader
        placeholder={intl.formatMessage(messages.placeholder)}
        onBack={handleDismissSearchClick}
        onSubmit={handleSearch}
        onActivate={handleSearchClick}
        active={mode === 'add'}
      />

      <ScrollableList
        scrollKey='list_members'
        trackScroll={!multiColumn}
        bindToDocument={!multiColumn}
        isLoading={loading}
        showLoading={loading && displayedAccountIds.length === 0}
        hasMore={false}
        footer={
          <>
            {displayedAccountIds.length > 0 && <div className='spacer' />}

            <div className='column-footer'>
              <Link to={`/lists/${id}`} className='button button--block'>
                <FormattedMessage id='lists.done' defaultMessage='Done' />
              </Link>
            </div>
          </>
        }
        emptyMessage={
          mode === 'remove' ? (
            <>
              <span>
                <FormattedMessage
                  id='lists.no_members_yet'
                  defaultMessage='No members yet.'
                />
                <br />
                <FormattedMessage
                  id='lists.find_users_to_add'
                  defaultMessage='Find users to add'
                />
              </span>

              <SquigglyArrow className='empty-column-indicator__arrow' />
            </>
          ) : (
            <FormattedMessage
              id='lists.no_results_found'
              defaultMessage='No results found.'
            />
          )
        }
      >
        {displayedAccountIds.map((accountId) => (
          <AccountItem
            key={accountId}
            accountId={accountId}
            listId={id}
            partOfList={
              displayedAccountIds === accountIds ||
              accountIds.includes(accountId)
            }
            onToggle={handleAccountToggle}
          />
        ))}
      </ScrollableList>

      <Helmet>
        <title>{intl.formatMessage(messages.heading)}</title>
        <meta name='robots' content='noindex' />
      </Helmet>
    </Column>
  );
};

// eslint-disable-next-line import/no-default-export
export default ListMembers;
